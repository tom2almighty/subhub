import type { ShareDto, shareCreateSchema } from '@subhub/shared';
import { asc, eq, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { randomToken } from '../auth/password.js';
import { db } from '../db/index.js';
import { outputs, type ShareRow, shares } from '../db/schema.js';
import { notFound } from '../errors.js';
import { getSubscriptionPaths } from './settings-service.js';

export type ShareCreateInput = z.infer<typeof shareCreateSchema>;

function now(): string {
  return new Date().toISOString();
}

export function serializeShare(row: ShareRow, outputName: string): ShareDto {
  return {
    id: row.id,
    outputId: row.outputId,
    outputName,
    token: row.token,
    url: `/${getSubscriptionPaths().sharePath}/${row.token}`,
    note: row.note,
    expiresAt: row.expiresAt,
    maxUses: row.maxUses,
    usedCount: row.usedCount,
    createdAt: row.createdAt,
  };
}

export function listShares(outputId: number): ShareDto[] {
  const output = db.select().from(outputs).where(eq(outputs.id, outputId)).get();
  if (!output) throw notFound(`Output ${outputId} does not exist`, 'OUTPUT_NOT_FOUND');
  return db
    .select()
    .from(shares)
    .where(eq(shares.outputId, outputId))
    .orderBy(asc(shares.id))
    .all()
    .map((row) => serializeShare(row, output.name));
}

export function createShare(outputId: number, input: ShareCreateInput): ShareDto {
  const output = db.select().from(outputs).where(eq(outputs.id, outputId)).get();
  if (!output) throw notFound(`Output ${outputId} does not exist`, 'OUTPUT_NOT_FOUND');
  const expiresAt =
    input.expiresInDays && input.expiresInDays > 0
      ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : null;
  const row = db
    .insert(shares)
    .values({
      outputId,
      token: randomToken(24),
      note: input.note ?? '',
      expiresAt,
      maxUses: input.maxUses ?? 0,
      usedCount: 0,
      createdAt: now(),
    })
    .returning()
    .get();
  return serializeShare(row, output.name);
}

export function updateShareNote(id: number, note: string): ShareDto {
  const row = db.select().from(shares).where(eq(shares.id, id)).get();
  if (!row) throw notFound(`Share ${id} does not exist`, 'SHARE_NOT_FOUND');
  db.update(shares).set({ note }).where(eq(shares.id, id)).run();
  const output = db.select().from(outputs).where(eq(outputs.id, row.outputId)).get();
  return serializeShare({ ...row, note }, output?.name ?? '');
}

export function deleteShare(id: number): void {
  const row = db.select().from(shares).where(eq(shares.id, id)).get();
  if (!row) throw notFound(`Share ${id} does not exist`, 'SHARE_NOT_FOUND');
  db.delete(shares).where(eq(shares.id, id)).run();
}

export function findShare(token: string): ShareRow {
  const row = db.select().from(shares).where(eq(shares.token, token)).get();
  if (!row) throw notFound('Share link does not exist', 'SHARE_NOT_FOUND');
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
  const result = db
    .update(shares)
    .set({ usedCount: sql`${shares.usedCount} + 1` })
    .where(
      sql`${shares.id} = ${row.id} AND (${shares.maxUses} = 0 OR ${shares.usedCount} < ${shares.maxUses})`,
    )
    .run();
  if (result.changes === 0) {
    throw notFound('Share link has reached its usage limit', 'SHARE_EXHAUSTED');
  }
  return row;
}
