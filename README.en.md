# subhub

[中文](README.md)

## Overview

subhub merges multiple proxy subscriptions behind one stable URL. It filters, renames, sorts, and script-processes nodes, then serves them as Surge, Mihomo, sing-box, and other formats. Share links can carry a note, an expiry date, and a usage limit. Processor chains can run on a single source or on the merged output.

## Development

Requires Node.js 26 and pnpm 12.

```bash
cp apps/server/.env.example apps/server/.env
# edit apps/server/.env and set at least ADMIN_PASSWORD
pnpm install
pnpm dev
```

The frontend dev server runs at `http://localhost:5173`; API and share requests are proxied to `http://localhost:3000`.

On first start with an empty database, `ADMIN_PASSWORD` sets the login password. Changing it later does not overwrite the existing password; change the password in Settings. This is a single-user setup: signing in only requires the password.

Commands:

```bash
pnpm check      # Biome checks and type checking
pnpm test       # proxy-core unit tests
pnpm build      # build frontend and server
pnpm start      # run the built server
```

See `apps/server/.env.example` for all server options. Set `COOKIE_SECURE=true` only when the site is served over HTTPS, and `TRUST_PROXY=true` when running behind a reverse proxy.

## Build and deployment

Build and run locally:

```bash
pnpm build
pnpm start
```

`pnpm start` runs from `apps/server`, loads `apps/server/.env`, and stores data in `apps/server/data` by default.

Docker:

```bash
cp apps/server/.env.example apps/server/.env
# edit apps/server/.env
docker build -t subhub .
docker run -d --name subhub -p 3000:3000 --env-file apps/server/.env -v ./data:/app/data subhub
```

Or use the prebuilt image:

```bash
docker compose up -d
```

The SQLite database lives at `subhub.db` inside the data directory, `/app/data/subhub.db` in the container. Back up the whole data directory before upgrading. The image does not include a reverse proxy; terminate HTTPS in your own environment.

Every source and aggregate has its own permanent URL under `/o/:token`. Share links use `/s/:token` and are created from the Shares page for either a source or an aggregate, with an optional note, expiry and usage limit. Both prefixes can be changed under Paths in Settings; changes take effect immediately and old links stop working. Links accept `?target=surge`, `?target=mihomo`, `?target=singbox`, and other target values; sources serve URI by default, while aggregates fall back to their own default platform.

## License

Licensed under [AGPL-3.0](LICENSE).
