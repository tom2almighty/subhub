import { applyProcessors, parseNodes, produce } from '@subhub/proxy-core';
import {
  type FlowInfo,
  type ProxyNode,
  type RefreshAllResult,
  SOURCE_DEFAULT_TARGET,
  type SourceDto,
  type sourceCreateSchema,
  type sourceUpdateSchema,
  type Target,
} from '@subhub/shared';
import { asc, eq, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { randomToken } from '../auth/password.js';
import { db } from '../db/index.js';
import { type SourceRow, sources } from '../db/schema.js';
import { conflict, isUniqueConstraintError, notFound } from '../errors.js';
import { invalidateSubscriptionCache } from './cache.js';
import { fetchFlow, fetchSubscription } from './fetcher.js';
import { getSubscriptionPaths } from './settings-service.js';
import { deleteSharesByTarget } from './share-service.js';

export type SourceCreateInput = z.infer<typeof sourceCreateSchema>;
export type SourceUpdateInput = z.infer<typeof sourceUpdateSchema>;

function now(): string {
  return new Date().toISOString();
}

export function serializeSource(row: SourceRow): SourceDto {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    directUrl: `/${getSubscriptionPaths().privatePath}/${row.token}`,
    url: row.url,
    flowUrl: row.flowUrl,
    userAgent: row.userAgent,
    headers: row.headers ?? {},
    proxy: row.proxy,
    refreshInterval: row.refreshInterval,
    noFlow: row.noFlow,
    enabled: row.enabled,
    processors: row.processors ?? [],
    nodeCount: row.nodes?.length ?? 0,
    fetchedAt: row.fetchedAt,
    lastError: row.lastError,
    flow: row.flow ?? null,
    content: row.kind === 'manual' ? row.raw : undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function listSources(): SourceDto[] {
  return db.select().from(sources).orderBy(asc(sources.id)).all().map(serializeSource);
}

export function findSource(id: number): SourceRow {
  const row = db.select().from(sources).where(eq(sources.id, id)).get();
  if (!row) throw notFound(`Source ${id} does not exist`, 'SOURCE_NOT_FOUND');
  return row;
}

export function getSource(id: number): SourceDto {
  return serializeSource(findSource(id));
}

export function findSourceByToken(token: string): SourceRow {
  const row = db.select().from(sources).where(eq(sources.token, token)).get();
  if (!row) throw notFound('Subscription link does not exist', 'SOURCE_NOT_FOUND');
  return row;
}

export async function buildSource(
  source: SourceRow,
  targetOverride?: Target,
): Promise<{
  target: Target;
  nodes: ProxyNode[];
  content: string;
  warnings: string[];
}> {
  const target = targetOverride ?? SOURCE_DEFAULT_TARGET;
  const warnings: string[] = [];
  const nodes = await applyProcessors(source.nodes, source.processors ?? [], target, {
    onWarning: (message) => warnings.push(message),
    resolveSourceName: () => source.name,
  });
  const produced = produce(nodes, target);
  return {
    target,
    nodes,
    content: produced.content,
    warnings: [...warnings, ...produced.warnings],
  };
}

export async function getSourceNodes(
  id: number,
  target: Target = 'uri',
): Promise<{ nodes: ProxyNode[]; warnings: string[] }> {
  const row = findSource(id);
  const warnings: string[] = [];
  const nodes = await applyProcessors(row.nodes, row.processors ?? [], target, {
    onWarning: (message) => warnings.push(message),
    resolveSourceName: () => row.name,
  });
  return { nodes, warnings };
}

export function createSource(input: SourceCreateInput): SourceDto {
  const timestamp = now();
  try {
    const result = db
      .insert(sources)
      .values({
        name: input.name,
        kind: input.kind ?? 'remote',
        token: randomToken(24),
        url: input.url ?? '',
        flowUrl: input.flowUrl ?? '',
        userAgent: input.userAgent ?? '',
        headers: input.headers ?? {},
        proxy: input.proxy ?? '',
        refreshInterval: input.refreshInterval ?? 60,
        noFlow: input.noFlow ?? false,
        enabled: input.enabled ?? true,
        processors: input.processors ?? [],
        raw: input.content ?? '',
        nodes: [],
        warnings: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .returning()
      .get();
    if (result.kind === 'manual') {
      applyManualContent(result.id, input.content ?? '');
    } else {
      void refreshSource(result.id, { force: true }).catch(() => undefined);
    }
    invalidateSubscriptionCache();
    return getSource(result.id);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw conflict(`Source name "${input.name}" already exists`, 'SOURCE_EXISTS');
    }
    throw error;
  }
}

export function updateSource(id: number, input: SourceUpdateInput): SourceDto {
  const existing = findSource(id);
  const patch: Partial<SourceRow> = { updatedAt: now() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.kind !== undefined) patch.kind = input.kind;
  if (input.url !== undefined) patch.url = input.url;
  if (input.flowUrl !== undefined) patch.flowUrl = input.flowUrl;
  if (input.userAgent !== undefined) patch.userAgent = input.userAgent;
  if (input.headers !== undefined) patch.headers = input.headers;
  if (input.proxy !== undefined) patch.proxy = input.proxy;
  if (input.refreshInterval !== undefined) patch.refreshInterval = input.refreshInterval;
  if (input.noFlow !== undefined) patch.noFlow = input.noFlow;
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  if (input.processors !== undefined) patch.processors = input.processors;
  if (input.content !== undefined) patch.raw = input.content;
  if (input.nodes !== undefined && (input.kind ?? existing.kind) === 'manual') {
    patch.nodes = input.nodes;
    patch.warnings = [];
    patch.fetchedAt = now();
    patch.lastError = null;
    if (input.content === undefined) {
      patch.raw = produce(input.nodes, 'uri').content;
    }
  } else if (input.content !== undefined && (input.kind ?? existing.kind) === 'manual') {
    patch.nodes = [];
    patch.warnings = [];
  }

  try {
    db.update(sources).set(patch).where(eq(sources.id, id)).run();
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw conflict(`Source name "${input.name}" already exists`, 'SOURCE_EXISTS');
    }
    throw error;
  }

  if (
    (input.kind ?? existing.kind) === 'manual' &&
    input.content !== undefined &&
    input.nodes === undefined
  ) {
    applyManualContent(id, input.content);
  } else if (
    (input.kind ?? existing.kind) === 'remote' &&
    (input.url !== undefined || input.content !== undefined)
  ) {
    void refreshSource(id, { force: true }).catch(() => undefined);
  }

  invalidateSubscriptionCache();
  return getSource(id);
}

function applyManualContent(id: number, content: string): void {
  const parsed = parseNodes(content);
  db.update(sources)
    .set({
      raw: content,
      nodes: parsed.nodes,
      warnings: parsed.warnings,
      fetchedAt: now(),
      lastError: null,
      updatedAt: now(),
    })
    .where(eq(sources.id, id))
    .run();
}

export async function refreshSource(
  id: number,
  options: { force?: boolean } = {},
): Promise<SourceDto> {
  const row = findSource(id);
  if (row.kind === 'manual') {
    applyManualContent(id, row.raw);
    invalidateSubscriptionCache();
    return getSource(id);
  }
  try {
    const result = await fetchSubscription(row, options);
    let flow: FlowInfo | null = result.flow ?? row.flow ?? null;
    if (row.flowUrl) {
      try {
        flow = (await fetchFlow(row)) ?? flow;
      } catch {
        // Keep the previous traffic data when the separate traffic URL fails.
      }
    }
    if (result.notModified) {
      db.update(sources)
        .set({ fetchedAt: now(), lastError: null, flow, updatedAt: now() })
        .where(eq(sources.id, id))
        .run();
    } else {
      db.update(sources)
        .set({
          raw: result.raw,
          nodes: result.nodes,
          warnings: result.warnings,
          flow,
          etag: result.etag,
          lastModified: result.lastModified,
          fetchedAt: now(),
          lastError: null,
          updatedAt: now(),
        })
        .where(eq(sources.id, id))
        .run();
    }
    invalidateSubscriptionCache();
    return getSource(id);
  } catch (error) {
    const message = error instanceof Error ? error.message : `${error}`;
    db.update(sources)
      .set({ lastError: message, updatedAt: now() })
      .where(eq(sources.id, id))
      .run();
    throw error;
  }
}

export async function refreshAllSources(): Promise<RefreshAllResult> {
  const rows = db.select().from(sources).where(eq(sources.enabled, true)).all();
  const remote = rows.filter((row) => row.kind === 'remote');
  let refreshed = 0;
  const failed: RefreshAllResult['failed'] = [];

  for (let index = 0; index < remote.length; index += 3) {
    const chunk = remote.slice(index, index + 3);
    await Promise.all(
      chunk.map(async (source) => {
        try {
          await refreshSource(source.id, { force: true });
          refreshed += 1;
        } catch (error) {
          failed.push({
            id: source.id,
            name: source.name,
            error: error instanceof Error ? error.message : `${error}`,
          });
        }
      }),
    );
  }

  return { total: remote.length, refreshed, failed };
}

export function deleteSource(id: number): void {
  findSource(id);
  deleteSharesByTarget('source', id);
  db.delete(sources).where(eq(sources.id, id)).run();
  invalidateSubscriptionCache();
}

export function dueSources(nowDate = new Date()): SourceRow[] {
  const rows = db.select().from(sources).where(eq(sources.enabled, true)).all();
  return rows.filter((row) => {
    if (row.kind !== 'remote' || row.refreshInterval <= 0) return false;
    if (!row.fetchedAt) return true;
    return nowDate.getTime() - new Date(row.fetchedAt).getTime() >= row.refreshInterval * 60_000;
  });
}

export function sourceCount(): number {
  const row = db.select({ count: sql<number>`count(*)` }).from(sources).get();
  return row?.count ?? 0;
}
