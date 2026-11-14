import type { FlowInfo, Processor, ProxyNode, Target } from '@subhub/shared';
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: text('created_at').notNull(),
});

export const sessions = sqliteTable('sessions', {
  idHash: text('id_hash').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull(),
});

export const sources = sqliteTable('sources', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  kind: text('kind', { enum: ['remote', 'manual'] }).notNull(),
  token: text('token').notNull().default(''),
  url: text('url').notNull().default(''),
  flowUrl: text('flow_url').notNull().default(''),
  userAgent: text('user_agent').notNull().default(''),
  headers: text('headers', { mode: 'json' }).$type<Record<string, string>>().notNull(),
  proxy: text('proxy').notNull().default(''),
  refreshInterval: integer('refresh_interval').notNull().default(60),
  noFlow: integer('no_flow', { mode: 'boolean' }).notNull().default(false),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  processors: text('processors', { mode: 'json' }).$type<Processor[]>().notNull(),
  raw: text('raw').notNull().default(''),
  nodes: text('nodes', { mode: 'json' }).$type<ProxyNode[]>().notNull(),
  warnings: text('warnings', { mode: 'json' }).$type<string[]>().notNull(),
  etag: text('etag'),
  lastModified: text('last_modified'),
  fetchedAt: text('fetched_at'),
  lastError: text('last_error'),
  flow: text('flow', { mode: 'json' }).$type<FlowInfo | null>(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const outputs = sqliteTable('outputs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  target: text('target').$type<Target>().notNull(),
  token: text('token').notNull().default(''),
  processors: text('processors', { mode: 'json' }).$type<Processor[]>().notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const outputSources = sqliteTable(
  'output_sources',
  {
    outputId: integer('output_id')
      .notNull()
      .references(() => outputs.id, { onDelete: 'cascade' }),
    sourceId: integer('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.outputId, table.sourceId] })],
);

export const shares = sqliteTable('shares', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  kind: text('kind', { enum: ['source', 'output'] }).notNull(),
  targetId: integer('target_id').notNull(),
  token: text('token').notNull().unique(),
  note: text('note').notNull().default(''),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  allowedTargets: text('allowed_targets', { mode: 'json' }).$type<Target[]>().notNull(),
  expiresAt: text('expires_at'),
  maxUses: integer('max_uses').notNull().default(0),
  usedCount: integer('used_count').notNull().default(0),
  lastUsedAt: text('last_used_at'),
  createdAt: text('created_at').notNull(),
});

export type UserRow = typeof users.$inferSelect;
export type SourceRow = typeof sources.$inferSelect;
export type OutputRow = typeof outputs.$inferSelect;
export type ShareRow = typeof shares.$inferSelect;
