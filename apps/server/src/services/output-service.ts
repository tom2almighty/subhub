import { applyProcessors, produce } from '@subhub/proxy-core';
import type {
  OutputDto,
  outputCreateSchema,
  outputUpdateSchema,
  PreviewDto,
  Processor,
  ProxyNode,
  Target,
} from '@subhub/shared';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { randomToken } from '../auth/password.js';
import { db } from '../db/index.js';
import { type OutputRow, outputSources, outputs, shares, sources } from '../db/schema.js';
import { conflict, isUniqueConstraintError, notFound } from '../errors.js';
import { getSubscriptionPaths } from './settings-service.js';

export type OutputCreateInput = z.infer<typeof outputCreateSchema>;
export type OutputUpdateInput = z.infer<typeof outputUpdateSchema>;

function now(): string {
  return new Date().toISOString();
}

function sourceLinks(outputId: number): { id: number; name: string }[] {
  return db
    .select({ id: sources.id, name: sources.name })
    .from(outputSources)
    .innerJoin(sources, eq(sources.id, outputSources.sourceId))
    .where(eq(outputSources.outputId, outputId))
    .orderBy(asc(outputSources.position))
    .all();
}

function shareCount(outputId: number): number {
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(shares)
    .where(and(eq(shares.kind, 'output'), eq(shares.targetId, outputId)))
    .get();
  return row?.count ?? 0;
}

export function serializeOutput(row: OutputRow): OutputDto {
  const linked = sourceLinks(row.id);
  return {
    id: row.id,
    name: row.name,
    target: row.target,
    url: `/${getSubscriptionPaths().privatePath}/${row.token}`,
    sourceIds: linked.map((item) => item.id),
    sources: linked,
    processors: row.processors ?? [],
    enabled: row.enabled,
    shareCount: shareCount(row.id),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function listOutputs(): OutputDto[] {
  return db.select().from(outputs).orderBy(asc(outputs.id)).all().map(serializeOutput);
}

export function findOutput(id: number): OutputRow {
  const row = db.select().from(outputs).where(eq(outputs.id, id)).get();
  if (!row) throw notFound(`Output ${id} does not exist`, 'OUTPUT_NOT_FOUND');
  return row;
}

export function getOutput(id: number): OutputDto {
  return serializeOutput(findOutput(id));
}

export function findOutputByToken(token: string): OutputRow {
  const row = db.select().from(outputs).where(eq(outputs.token, token)).get();
  if (!row) throw notFound('Subscription link does not exist', 'OUTPUT_NOT_FOUND');
  return row;
}

function assertSourcesExist(sourceIds: number[]): void {
  if (sourceIds.length === 0) return;
  const existing = db
    .select({ id: sources.id })
    .from(sources)
    .where(inArray(sources.id, sourceIds))
    .all();
  const existingIds = new Set(existing.map((item) => item.id));
  const missing = sourceIds.filter((id) => !existingIds.has(id));
  if (missing.length > 0) {
    throw notFound(`Source ${missing.join(', ')} does not exist`, 'SOURCE_NOT_FOUND');
  }
}

function setSourceLinks(outputId: number, sourceIds: number[]): void {
  const unique = [...new Set(sourceIds)];
  assertSourcesExist(unique);
  db.transaction((tx) => {
    tx.delete(outputSources).where(eq(outputSources.outputId, outputId)).run();
    unique.forEach((sourceId, position) => {
      tx.insert(outputSources).values({ outputId, sourceId, position }).run();
    });
  });
}

export function createOutput(input: OutputCreateInput): OutputDto {
  const timestamp = now();
  assertSourcesExist(input.sourceIds ?? []);
  try {
    const result = db
      .insert(outputs)
      .values({
        name: input.name,
        target: input.target,
        token: randomToken(24),
        processors: input.processors ?? [],
        enabled: input.enabled ?? true,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .returning()
      .get();
    setSourceLinks(result.id, input.sourceIds ?? []);
    return getOutput(result.id);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw conflict(`Output name "${input.name}" already exists`, 'OUTPUT_EXISTS');
    }
    throw error;
  }
}

export function updateOutput(id: number, input: OutputUpdateInput): OutputDto {
  findOutput(id);
  if (input.sourceIds !== undefined) assertSourcesExist([...new Set(input.sourceIds)]);
  const patch: Partial<OutputRow> = { updatedAt: now() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.target !== undefined) patch.target = input.target as Target;
  if (input.processors !== undefined) patch.processors = input.processors as Processor[];
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  try {
    db.update(outputs).set(patch).where(eq(outputs.id, id)).run();
    if (input.sourceIds !== undefined) setSourceLinks(id, input.sourceIds);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw conflict(`Output name "${input.name}" already exists`, 'OUTPUT_EXISTS');
    }
    throw error;
  }
  return getOutput(id);
}

export function deleteOutput(id: number): void {
  findOutput(id);
  db.delete(outputs).where(eq(outputs.id, id)).run();
}

export async function resolveOutputNodes(
  row: OutputRow,
  target: Target,
): Promise<{ nodes: ProxyNode[]; warnings: string[] }> {
  const linked = db
    .select({ sourceId: outputSources.sourceId })
    .from(outputSources)
    .where(eq(outputSources.outputId, row.id))
    .orderBy(asc(outputSources.position))
    .all();
  if (linked.length === 0) return { nodes: [], warnings: [] };
  const rows = db
    .select()
    .from(sources)
    .where(
      inArray(
        sources.id,
        linked.map((item) => item.sourceId),
      ),
    )
    .all();
  const byId = new Map(rows.map((item) => [item.id, item]));
  const nodes: ProxyNode[] = [];
  const warnings: string[] = [];
  for (const item of linked) {
    const source = byId.get(item.sourceId);
    if (!source) continue;
    const processed = await applyProcessors(source.nodes, source.processors ?? [], target, {
      onWarning: (message) => warnings.push(`${source.name}: ${message}`),
    });
    nodes.push(...processed);
  }
  return { nodes, warnings };
}

export async function buildOutput(
  id: number,
  targetOverride?: Target,
): Promise<{
  output: OutputRow;
  target: Target;
  nodes: ProxyNode[];
  content: string;
  warnings: string[];
}> {
  const output = findOutput(id);
  const target = targetOverride ?? output.target;
  const collected = await resolveOutputNodes(output, target);
  const warnings = [...collected.warnings];
  const processed = await applyProcessors(collected.nodes, output.processors ?? [], target, {
    onWarning: (message) => warnings.push(message),
  });
  const produced = produce(processed, target);
  return {
    output,
    target,
    nodes: processed,
    content: produced.content,
    warnings: [...warnings, ...produced.warnings],
  };
}

export async function previewOutput(id: number, target?: Target): Promise<PreviewDto> {
  const built = await buildOutput(id, target);
  return {
    target: built.target,
    count: built.nodes.length,
    nodes: built.nodes.map((node) => ({
      name: node.name,
      type: node.type,
      server: node.server,
      port: node.port,
      hostname: node.hostname,
      'control-url': node['control-url'],
    })),
    content: built.content,
    warnings: built.warnings,
  };
}
