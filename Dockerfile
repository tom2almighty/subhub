FROM node:26-bookworm-slim AS build

WORKDIR /app
RUN npm install -g pnpm@12.18.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/proxy-core/package.json packages/proxy-core/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build \
  && pnpm --filter @subhub/server --prod deploy /out

FROM node:26-bookworm-slim AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/app/data \
    WEB_DIST=/app/web

WORKDIR /app
COPY --chown=node:node --from=build /out/node_modules ./node_modules
COPY --chown=node:node --from=build /out/dist ./dist
COPY --chown=node:node --from=build /out/package.json ./package.json
COPY --chown=node:node --from=build /app/apps/web/dist ./web

RUN mkdir -p /app/data && chown node:node /app/data

EXPOSE 3000
VOLUME ["/app/data"]

# Bind-mounted data directories are usually owned by root. For a non-root
# runtime, chown ./data to 1000:1000 and uncomment the next line.
# USER node

CMD ["node", "dist/index.js"]
