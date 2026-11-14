import { hashPassword, randomToken } from '../auth/password.js';
import { env } from '../env.js';
import { sqlite } from './index.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  token TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  flow_url TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  headers TEXT NOT NULL,
  proxy TEXT NOT NULL DEFAULT '',
  refresh_interval INTEGER NOT NULL DEFAULT 60,
  no_flow INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  processors TEXT NOT NULL DEFAULT '[]',
  raw TEXT NOT NULL DEFAULT '',
  nodes TEXT NOT NULL,
  warnings TEXT NOT NULL,
  etag TEXT,
  last_modified TEXT,
  fetched_at TEXT,
  last_error TEXT,
  flow TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS outputs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  target TEXT NOT NULL,
  token TEXT NOT NULL DEFAULT '',
  processors TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS output_sources (
  output_id INTEGER NOT NULL REFERENCES outputs(id) ON DELETE CASCADE,
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (output_id, source_id)
);
CREATE INDEX IF NOT EXISTS output_sources_source_idx ON output_sources(source_id);

CREATE TABLE IF NOT EXISTS shares (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  note TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  allowed_targets TEXT NOT NULL DEFAULT '[]',
  expires_at TEXT,
  max_uses INTEGER NOT NULL DEFAULT 0,
  used_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

function hasColumn(table: string, column: string): boolean {
  const rows = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.some((row) => row.name === column);
}

export function migrate(): void {
  sqlite.exec(SCHEMA);
  sqlite.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('private_path', 'o')").run();
  sqlite.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('share_path', 's')").run();
  if (!hasColumn('shares', 'note')) {
    sqlite.exec("ALTER TABLE shares ADD COLUMN note TEXT NOT NULL DEFAULT ''");
  }
  if (hasColumn('shares', 'output_id') && !hasColumn('shares', 'kind')) {
    sqlite.exec(`
      ALTER TABLE shares RENAME TO shares_legacy;
      CREATE TABLE shares (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        target_id INTEGER NOT NULL,
        token TEXT NOT NULL UNIQUE,
        note TEXT NOT NULL DEFAULT '',
        expires_at TEXT,
        max_uses INTEGER NOT NULL DEFAULT 0,
        used_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      INSERT INTO shares (id, kind, target_id, token, note, expires_at, max_uses, used_count, created_at)
        SELECT id, 'output', output_id, token, note, expires_at, max_uses, used_count, created_at
        FROM shares_legacy;
      DROP TABLE shares_legacy;
    `);
  }
  sqlite.exec('CREATE INDEX IF NOT EXISTS shares_target_idx ON shares(kind, target_id)');
  if (!hasColumn('shares', 'enabled')) {
    sqlite.exec('ALTER TABLE shares ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1');
  }
  if (!hasColumn('shares', 'allowed_targets')) {
    sqlite.exec("ALTER TABLE shares ADD COLUMN allowed_targets TEXT NOT NULL DEFAULT '[]'");
  }
  if (!hasColumn('shares', 'last_used_at')) {
    sqlite.exec('ALTER TABLE shares ADD COLUMN last_used_at TEXT');
  }
  if (!hasColumn('sources', 'token')) {
    sqlite.exec("ALTER TABLE sources ADD COLUMN token TEXT NOT NULL DEFAULT ''");
  }
  const missingSourceTokens = sqlite.prepare("SELECT id FROM sources WHERE token = ''").all() as {
    id: number;
  }[];
  const updateSourceToken = sqlite.prepare('UPDATE sources SET token = ? WHERE id = ?');
  for (const row of missingSourceTokens) {
    updateSourceToken.run(randomToken(24), row.id);
  }
  sqlite.exec('CREATE UNIQUE INDEX IF NOT EXISTS sources_token_idx ON sources(token)');
  if (!hasColumn('sources', 'processors')) {
    sqlite.exec("ALTER TABLE sources ADD COLUMN processors TEXT NOT NULL DEFAULT '[]'");
  }
  if (!hasColumn('sources', 'flow_url')) {
    sqlite.exec("ALTER TABLE sources ADD COLUMN flow_url TEXT NOT NULL DEFAULT ''");
  }
  if (!hasColumn('outputs', 'token')) {
    sqlite.exec("ALTER TABLE outputs ADD COLUMN token TEXT NOT NULL DEFAULT ''");
  }
  const missingTokens = sqlite.prepare("SELECT id FROM outputs WHERE token = ''").all() as {
    id: number;
  }[];
  const updateToken = sqlite.prepare('UPDATE outputs SET token = ? WHERE id = ?');
  for (const row of missingTokens) {
    updateToken.run(randomToken(24), row.id);
  }
  sqlite.exec('CREATE UNIQUE INDEX IF NOT EXISTS outputs_token_idx ON outputs(token)');
  const row = sqlite.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };
  if (row.count > 0) return;
  if (!env.adminPassword) {
    throw new Error(
      'ADMIN_PASSWORD is required on first start. Set it in the environment and restart.',
    );
  }
  sqlite
    .prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)')
    .run('owner', hashPassword(env.adminPassword), new Date().toISOString());
}
