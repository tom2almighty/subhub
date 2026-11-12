import type { SubscriptionPaths } from '@subhub/shared';
import { sqlite } from '../db/index.js';
import { badRequest } from '../errors.js';

export const DEFAULT_PRIVATE_PATH = 'o';
export const DEFAULT_SHARE_PATH = 's';

const RESERVED_SEGMENTS = new Set([
  'api',
  'assets',
  'fonts',
  '__sub',
  'login',
  'sources',
  'outputs',
  'settings',
]);

let cache: SubscriptionPaths | undefined;

export function getSubscriptionPaths(): SubscriptionPaths {
  if (cache) return cache;
  const rows = sqlite.prepare('SELECT key, value FROM settings').all() as {
    key: string;
    value: string;
  }[];
  const stored = new Map(rows.map((row) => [row.key, row.value]));
  cache = {
    privatePath: stored.get('private_path') ?? DEFAULT_PRIVATE_PATH,
    sharePath: stored.get('share_path') ?? DEFAULT_SHARE_PATH,
  };
  return cache;
}

export function updateSubscriptionPaths(input: SubscriptionPaths): SubscriptionPaths {
  for (const path of [input.privatePath, input.sharePath]) {
    if (RESERVED_SEGMENTS.has(path.toLowerCase())) {
      throw badRequest(`Path "${path}" is reserved`, 'PATH_RESERVED');
    }
  }
  const upsert = sqlite.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  );
  sqlite.transaction(() => {
    upsert.run('private_path', input.privatePath);
    upsert.run('share_path', input.sharePath);
  })();
  cache = { ...input };
  return getSubscriptionPaths();
}
