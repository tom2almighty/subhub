# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目范围

subhub 是单用户的代理订阅聚合与转换服务：多个节点源 → 节点处理 → 合并 → 输出处理 → 目标平台配置/订阅。每个节点源和聚合订阅都有私有固定链接 `/o/:token`，分享链接 `/s/:token` 可指向节点源或聚合订阅并限量。

- 仅服务端部署（Docker + SQLite），前端是纯 SPA。
- 移动优先；登录只校验密码，没有用户名。
- 不做 SSR、模块化部署、Gist 同步。

## 技术栈与目录

pnpm workspace，Node.js 26，包管理器版本由根 `package.json` 的 `packageManager` 固定。

- `apps/server`：Fastify 5 + Drizzle ORM + better-sqlite3，tsup 打包为单文件 ESM。
- `apps/web`：React 19 + Vite 7 + Tailwind 4 + shadcn/ui（Nova），TanStack Query + React Router。
- `packages/shared`：zod 校验 schema 与前后端共用 DTO/类型。
- `packages/proxy-core`：纯函数库，负责解析、处理器链与各平台输出。
- `refer/`：Sub-Store 参考代码，只读，不参与构建与检查。

## 常用命令

在仓库根目录执行：

```bash
cp apps/server/.env.example apps/server/.env   # 至少设置 ADMIN_PASSWORD
pnpm install
pnpm dev        # 前端 5173，API 3000
pnpm check      # Biome + 全量类型检查
pnpm format     # Biome 写回
pnpm test       # 仅 proxy-core 的 vitest
pnpm build      # 构建 web dist 与 server dist
pnpm start      # 运行构建后的服务端
```

单个测试：

```bash
pnpm --filter @subhub/proxy-core exec vitest run test/core.test.ts -t "parses VLESS"
```

开发服务器将 `/api`、`/o/`、`/s/` 代理到 `http://localhost:3000`。

## 架构

### 请求与认证

`apps/server/src/app.ts` 是入口编排：cookie、helmet、限流、静态 SPA、路由注册、统一错误格式 `{ code, message }`。所有 `/api/*`（`/api/health`、`/api/auth/login` 除外）先做会话校验；非 GET/HEAD 请求还必须带 `x-subhub-request: 1`，这是前端 `lib/api.ts` 与后端共享的 CSRF 约定，新增前端请求不要绕过 `api.ts`。

订阅路径的前缀保存在 `settings` 表中，默认是 `o` 和 `s`，可在设置页修改。`app.ts` 的 `rewriteUrl` 在路由前把当前前缀重写到内部路由 `/__sub/private/:token`、`/__sub/share/:token`，所以改前缀无需重启，也不要在别处硬编码 `/o/` 或 `/s/`。两条订阅路由不经过 `/api` 钩子：私有路由先按 `outputs.token` 查找，未命中再按 `sources.token`；分享路由按 `shares.kind` 指向 `source` 或 `output`。都接受 `?target=` 临时覆盖输出平台（非法值返回 400）和 `?download=0`（或 `false`）改为 `inline` 响应，默认是附件下载；节点源链接不带参数时输出 URI，分享链接只在成功返回后计数。

### 数据层

SQLite + Drizzle。`db/schema.ts` 提供 ORM 类型，`db/migrate.ts` 里的 `SCHEMA` 字符串才是实际建表 SQL，两者需要手工保持同步（项目没有 drizzle-kit 迁移目录）。改表时同时处理：更新 schema、更新 SCHEMA、在 `migrate()` 中用 `hasColumn` 做幂等 `ALTER` 并回填历史数据。`sources` 与 `outputs` 各自持有 `token`；`shares` 用 `kind`（`source`/`output`）+ `target_id` 指向目标，不再绑定单一输出表。`settings` 是简单的 key-value 表，保存订阅路径前缀；`settings-service` 在内存中缓存，更新后立即刷新。首次启动且无用户时用 `ADMIN_PASSWORD` 创建唯一用户。

### 订阅构建链路

1. `source-service.refreshSource` 抓取或读取节点并解析，结果持久化到 `sources`（`raw`、`nodes`、`warnings`、`etag`、`flow` 一起保存）。
2. `buildOutput` 按 `output_sources.position` 顺序取源，对每个源执行其 `processors`（此时已确定本次输出平台），然后合并节点。
3. 对合并后的节点执行 `output.processors`。
4. `proxy-core.produce` 生成目标格式文本。

target 会传入每一级处理器。DNS 处理器放在节点源链路，用于按提供商解析域名；输出链路只处理合并后的节点。处理器类型与参数是 `packages/shared` 的 discriminated union：新增处理器需要同时改 shared schema、proxy-core 实现、`ProcessorEditor` 的默认值与参数表单，以及两个 locale 文件。

### proxy-core

- `parse/`：自动识别 URI 列表、Base64、Mihomo YAML、sing-box JSON，以及 Surge/Loon 行、Quantumult X 行和 `[Proxy]`/`[server_local]`/`[server_remote]` 分节配置。命名统一使用 mihomo。
- `processors.ts`：过滤、改名、排序、脚本、加节点、旗帜、DNS。
- `produce/`：Surge、Mihomo/Stash、Loon、Quantumult X、sing-box、URI、JSON。

`text.ts` 统一处理引号：解析后清掉 host/path/SNI 等文本字段外层的引号，输出时按格式需要重新加引号并转义，凭据字段不参与去引号。新增输入解析或输出平台时复用它，避免嵌套引号。

保持纯函数、无 IO（DNS 处理器除外，它走 DoH/DoT），方便单测。

### 前端

`App.tsx` 懒加载页面；`RequireAuth` 通过 `/api/auth/me` 判定登录。`AppLayout` 是 `h-svh` 满高外壳，页面遵循 `flex min-h-0 flex-1 flex-col` + 内部滚动的结构。节点源与聚合列表通过 `ViewSwitcher` 在列表和卡片间切换，选择写入 localStorage；移动端固定卡片，列数由 `.card-grid` 的 auto-fill 按可用宽度决定。分享链接集中在 `SharesPage` 管理，节点源与聚合详情不再包含分享面板。`ProcessorEditor` 使用 dnd-kit 拖动排序，顺序即处理器执行顺序。组件只用 `components/ui` 中的 shadcn 源码与语义化 Tailwind token。

i18n 默认中文，资源只包含 `zh-CN` 与 `en-US`，`types/i18n.d.ts` 从 `zh-CN.json` 推导 key，新增文案必须同时补两个 JSON。

## 约定与注意

- Fastify 静态托管使用 `wildcard: false`：重新构建前端后必须重启服务端，否则新的 hash 资源会被回退成 `index.html`。
- 数据请求统一走 TanStack Query，不要在 `useEffect` 里手写拉取；`api.ts` 会自动附带 credentials 与 CSRF 头。
- 私有 `/o/` 链接与分享链接的限制互不影响。
- `.env` 不提交；`ADMIN_PASSWORD` 只在首次建库时生效，之后改密码走设置页。
- CI（`.github/workflows/ci.yml`）在 Node 26 上执行 check/test/build；推送 `v*.*.*` tag 触发多架构镜像与 GitHub Release。
- 行为或配置变化要同步 `README.md` 与 `README.en.md`。
