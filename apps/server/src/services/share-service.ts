import {
  type ShareDto,
  type ShareTargetKind,
  SOURCE_DEFAULT_TARGET,
  type shareCreateSchema,
  type shareUpdateSchema,
  type Target,
} from '@subhub/shared';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { randomToken } from '../auth/password.js';
import { db } from '../db/index.js';
import { outputs, type ShareRow, shares, sources } from '../db/schema.js';
import { notFound } from '../errors.js';
import { getSubscriptionPaths } from './settings-service.js';

export type ShareCreateInput = z.infer<typeof shareCreateSchema>;
export type ShareUpdateInput = z.infer<typeof shareUpdateSchema>;

interface TargetInfo {
  name: string;
  defaultTarget: Target;
}

function now(): string {
  return new Date().toISOString();
}

function targetInfo(kind: ShareTargetKind, targetId: number): TargetInfo {
  if (kind === 'output') {
    const row = db.select().from(outputs).where(eq(outputs.id, targetId)).get();
    if (!row) throw notFound(`Output ${targetId} does not exist`, 'OUTPUT_NOT_FOUND');
    return { name: row.name, defaultTarget: row.target };
  }
  const row = db.select().from(sources).where(eq(sources.id, targetId)).get();
  if (!row) throw notFound(`Source ${targetId} does not exist`, 'SOURCE_NOT_FOUND');
  return { name: row.name, defaultTarget: SOURCE_DEFAULT_TARGET };
}

export function serializeShare(row: ShareRow, info: TargetInfo): ShareDto {
  return {
    id: row.id,
    kind: row.kind,
    targetId: row.targetId,
    targetName: info.name,
    defaultTarget: info.defaultTarget,
    token: row.token,
    url: `/${getSubscriptionPaths().sharePath}/${row.token}`,
    note: row.note,
    enabled: row.enabled,
    allowedTargets: row.allowedTargets ?? [],
    expiresAt: row.expiresAt,
    maxUses: row.maxUses,
    usedCount: row.usedCount,
    lastUsedAt: row.lastUsedAt ?? null,
    createdAt: row.createdAt,
  };
}

function infoMap(kind: ShareTargetKind, rows: ShareRow[]): Map<number, TargetInfo> {
  const ids = [...new Set(rows.filter((row) => row.kind === kind).map((row) => row.targetId))];
  if (ids.length === 0) return new Map();
  const map = new Map<number, TargetInfo>();
  if (kind === 'output') {
    const found = db
      .select({ id: outputs.id, name: outputs.name, target: outputs.target })
      .from(outputs)
      .where(inArray(outputs.id, ids))
      .all();
    for (const row of found) map.set(row.id, { name: row.name, defaultTarget: row.target });
  } else {
    const found = db
      .select({ id: sources.id, name: sources.name })
      .from(sources)
      .where(inArray(sources.id, ids))
      .all();
    for (const row of found) {
      map.set(row.id, { name: row.name, defaultTarget: SOURCE_DEFAULT_TARGET });
    }
  }
  return map;
}

export function listShares(): ShareDto[] {
  const rows = db.select().from(shares).orderBy(asc(shares.id)).all();
  const outputInfo = infoMap('output', rows);
  const sourceInfo = infoMap('source', rows);
  return rows.flatMap((row) => {
    const info = (row.kind === 'output' ? outputInfo : sourceInfo).get(row.targetId);
    return info ? [serializeShare(row, info)] : [];
  });
}

export function createShare(input: ShareCreateInput): ShareDto {
  const info = targetInfo(input.kind, input.targetId);
  const expiresAt =
    input.expiresInDays && input.expiresInDays > 0
      ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : null;
  const row = db
    .insert(shares)
    .values({
      kind: input.kind,
      targetId: input.targetId,
      token: randomToken(24),
      note: input.note ?? '',
      enabled: input.enabled ?? true,
      allowedTargets: input.allowedTargets ?? [],
      expiresAt,
      maxUses: input.maxUses ?? 0,
      usedCount: 0,
      lastUsedAt: null,
      createdAt: now(),
    })
    .returning()
    .get();
  return serializeShare(row, info);
}

export function updateShare(id: number, input: ShareUpdateInput): ShareDto {
  const row = db.select().from(shares).where(eq(shares.id, id)).get();
  if (!row) throw notFound(`Share ${id} does not exist`, 'SHARE_NOT_FOUND');
  const patch: Partial<ShareRow> = {};
  if (input.note !== undefined) patch.note = input.note;
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  if (input.allowedTargets !== undefined) patch.allowedTargets = input.allowedTargets;
  if (Object.keys(patch).length > 0) {
    db.update(shares).set(patch).where(eq(shares.id, id)).run();
  }
  const updated = { ...row, ...patch };
  return serializeShare(updated, targetInfo(row.kind, row.targetId));
}

export function deleteSharesByTarget(kind: ShareTargetKind, targetId: number): void {
  db.delete(shares)
    .where(and(eq(shares.kind, kind), eq(shares.targetId, targetId)))
    .run();
}

export function deleteShare(id: number): void {
  const row = db.select().from(shares).where(eq(shares.id, id)).get();
  if (!row) throw notFound(`Share ${id} does not exist`, 'SHARE_NOT_FOUND');
  db.delete(shares).where(eq(shares.id, id)).run();
}

export function findShare(token: string): ShareRow {
  const row = db.select().from(shares).where(eq(shares.token, token)).get();
  if (!row) throw notFound('Share link does not exist', 'SHARE_NOT_FOUND');
  if (!row.enabled) {
    throw notFound('Share link is disabled', 'SHARE_DISABLED');
  }
  if (row.expiresAt && new Date(row.expiresAt).getTime() <= Date.now()) {
    throw notFound('Share link has expired', 'SHARE_EXPIRED');
  }
  if (row.maxUses > 0 && row.usedCount >= row.maxUses) {
    throw notFound('Share link has reached its usage limit', 'SHARE_EXHAUSTED');
  }
  return row;
}

export function consumeShare(token: string): ShareRow {
  const row = findShare(token);
  const timestamp = now();
  const result = db
    .update(shares)
    .set({ usedCount: sql`${shares.usedCount} + 1`, lastUsedAt: timestamp })
    .where(
      sql`${shares.id} = ${row.id} AND (${shares.maxUses} = 0 OR ${shares.usedCount} < ${shares.maxUses})`,
    )
    .run();
  if (result.changes === 0) {
    throw notFound('Share link has reached its usage limit', 'SHARE_EXHAUSTED');
  }
  return row;
}
