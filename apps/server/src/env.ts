import { existsSync } from 'node:fs';
import path from 'node:path';
import 'dotenv/config';

function int(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resolveWebDist(): string {
  if (process.env.WEB_DIST) return path.resolve(process.env.WEB_DIST);
  const fromRoot = path.resolve(process.cwd(), 'apps/web/dist');
  if (existsSync(path.join(fromRoot, 'index.html'))) return fromRoot;
  return path.resolve(process.cwd(), '../web/dist');
}

const dataDir = path.resolve(process.env.DATA_DIR ?? 'data');

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction: process.env.NODE_ENV === 'production',
  host: process.env.HOST ?? '0.0.0.0',
  port: int(process.env.PORT, 3000),
  dataDir,
  databasePath: path.resolve(process.env.DATABASE_PATH ?? path.join(dataDir, 'subhub.db')),
  adminPassword: process.env.ADMIN_PASSWORD ?? '',
  sessionTtlDays: int(process.env.SESSION_TTL_DAYS, 30),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  trustProxy: process.env.TRUST_PROXY === 'true',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  webDist: resolveWebDist(),
  fetchTimeoutMs: int(process.env.FETCH_TIMEOUT_MS, 30_000),
  defaultUserAgent:
    process.env.DEFAULT_USER_AGENT ??
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
};
