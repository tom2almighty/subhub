# subhub

[English](README.en.md)

## 项目简介

subhub 把多个代理订阅聚合成一个固定地址，支持过滤、重命名、排序、脚本处理等节点加工，输出 Surge、Mihomo、sing-box 等格式，并可生成带备注、有效期和使用次数限制的分享链接。节点处理链可在单个节点源或合并后的订阅输出上执行。

## 开发环境配置

依赖 Node.js 26 与 pnpm 12。

```bash
cp apps/server/.env.example apps/server/.env
# 编辑 apps/server/.env，至少设置 ADMIN_PASSWORD
pnpm install
pnpm dev
```

前端开发服务器为 `http://localhost:5173`，API 与分享链接请求会代理到 `http://localhost:3000`。

首次启动且数据库无用户时，使用 `ADMIN_PASSWORD` 创建登录密码。之后修改该变量不会覆盖已有密码，密码请在设置页修改。本项目为单用户模式，登录只需密码。

常用命令：

```bash
pnpm check      # Biome 检查与全量类型检查
pnpm test       # proxy-core 单元测试
pnpm build      # 构建前端与服务端
pnpm start      # 运行构建后的服务端
```

服务端配置项见 `apps/server/.env.example`。`COOKIE_SECURE=true` 仅在通过 HTTPS 访问时开启；反向代理部署时设置 `TRUST_PROXY=true` 以正确读取客户端地址。

## 构建与部署

本地构建并运行：

```bash
pnpm build
pnpm start
```

`pnpm start` 从 `apps/server` 目录启动，读取 `apps/server/.env`，默认数据目录为 `apps/server/data`。

Docker：

```bash
cp apps/server/.env.example apps/server/.env
# 编辑 apps/server/.env
docker build -t subhub .
docker run -d --name subhub -p 3000:3000 --env-file apps/server/.env -v ./data:/app/data subhub
```

或使用预编译镜像：

```bash
docker compose up -d
```

数据库文件位于数据目录下的 `subhub.db`，默认容器路径为 `/app/data/subhub.db`。升级前备份整个数据目录即可。容器不内置反向代理，请由运行环境处理 HTTPS。

订阅地址分为两类：自己的固定地址与分享链接，默认路径分别为 `/o/:token` 和 `/s/:token`。两个前缀都可以在设置页的「路径」中修改，保存后立即生效，旧链接随即失效。两者都支持 `?target=surge`、`?target=mihomo`、`?target=singbox` 等参数切换输出平台，不带参数时使用订阅输出的默认平台。

## 开源许可证

本项目采用 [AGPL-3.0](LICENSE) 许可证。
