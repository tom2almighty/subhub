import { applyProcessors, produce } from '@subhub/proxy-core';
import type {
  DroppedNodeInfo,
  OutputDto,
  outputCreateSchema,
  outputDryRunSchema,
  outputUpdateSchema,
  PreviewDto,
  PreviewNode,
  Processor,
  ProcessorTraceStep,
  ProxyNode,
  SourceBuildStat,
  Target,
} from '@subhub/shared';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { randomToken } from '../auth/password.js';
import { db } from '../db/index.js';
import { type OutputRow, outputSources, outputs, shares, sources } from '../db/schema.js';
import { conflict, isUniqueConstraintError, notFound } from '../errors.js';
import { invalidateSubscriptionCache } from './cache.js';
import { getSubscriptionPaths } from './settings-service.js';
import { deleteSharesByTarget } from './share-service.js';

export type OutputCreateInput = z.infer<typeof outputCreateSchema>;
export type OutputUpdateInput = z.infer<typeof outputUpdateSchema>;
export type OutputDryRunInput = z.infer<typeof outputDryRunSchema>;

function now(): string {
  return new Date().toISOString();
}

function sourceLinks(outputId: number): { id: number; name: string; enabled: boolean }[] {
  return db
    .select({ id: sources.id, name: sources.name, enabled: sources.enabled })
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
    invalidateSubscriptionCache();
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
  invalidateSubscriptionCache();
  return getOutput(id);
}

export function deleteOutput(id: number): void {
  findOutput(id);
  deleteSharesByTarget('output', id);
  db.delete(outputs).where(eq(outputs.id, id)).run();
  invalidateSubscriptionCache();
}

function nodeEndpointKey(node: ProxyNode): string {
  return `${node.type}|${node.server ?? node.hostname ?? ''}|${node.port ?? ''}`;
}

async function resolveSourcesByIds(
  sourceIds: number[],
  target: Target,
): Promise<{
  nodes: ProxyNode[];
  warnings: string[];
  inputCount: number;
  sourceStats: SourceBuildStat[];
  resolveSourceName: (node: ProxyNode) => string | undefined;
}> {
  if (sourceIds.length === 0) {
    return {
      nodes: [],
      warnings: [],
      inputCount: 0,
      sourceStats: [],
      resolveSourceName: () => undefined,
    };
  }
  const rows = db.select().from(sources).where(inArray(sources.id, sourceIds)).all();
  const byId = new Map(rows.map((item) => [item.id, item]));
  const nodes: ProxyNode[] = [];
  const warnings: string[] = [];
  const sourceStats: SourceBuildStat[] = [];
  const byRef = new WeakMap<ProxyNode, string>();
  const byEndpoint = new Map<string, string>();
  let inputCount = 0;
  for (const sourceId of sourceIds) {
    const source = byId.get(sourceId);
    if (!source) continue;
    if (!source.enabled) {
      sourceStats.push({
        id: source.id,
        name: source.name,
        enabled: false,
        rawCount: source.nodes.length,
        afterCount: 0,
      });
      continue;
    }
    inputCount += source.nodes.length;
    const processed = await applyProcessors(source.nodes, source.processors ?? [], target, {
      onWarning: (message) => warnings.push(`${source.name}: ${message}`),
    });
    sourceStats.push({
      id: source.id,
      name: source.name,
      enabled: true,
      rawCount: source.nodes.length,
      afterCount: processed.length,
    });
    for (const item of processed) {
      byRef.set(item, source.name);
      const key = nodeEndpointKey(item);
      if (!byEndpoint.has(key)) byEndpoint.set(key, source.name);
    }
    nodes.push(...processed);
  }
  return {
    nodes,
    warnings,
    inputCount,
    sourceStats,
    resolveSourceName: (node: ProxyNode) =>
      byRef.get(node) ?? byEndpoint.get(nodeEndpointKey(node)),
  };
}

export async function resolveOutputNodes(
  row: OutputRow,
  target: Target,
): Promise<{
  nodes: ProxyNode[];
  warnings: string[];
  inputCount: number;
  sourceStats: SourceBuildStat[];
}> {
  const linked = db
    .select({ sourceId: outputSources.sourceId })
    .from(outputSources)
    .where(eq(outputSources.outputId, row.id))
    .orderBy(asc(outputSources.position))
    .all();
  return resolveSourcesByIds(
    linked.map((item) => item.sourceId),
    target,
  );
}

function toPreviewNodes(
  nodes: ProxyNode[],
  resolveSourceName?: (node: ProxyNode) => string | undefined,
): PreviewNode[] {
  return nodes.map((node) => ({
    name: node.name,
    type: node.type,
    server: node.server,
    port: node.port,
    hostname: node.hostname,
    'control-url': node['control-url'],
    tls: node.tls,
    network: node.network,
    udp: node.udp,
    sni: node.sni,
    servername: node.servername,
    alpn: node.alpn,
    flow: node.flow,
    cipher: node.cipher,
    obfs: node.obfs,
    ports: node.ports,
    sourceName: resolveSourceName?.(node),
    raw: node,
  }));
}

async function executePipeline(params: {
  sourceIds: number[];
  processors: Processor[];
  target: Target;
}): Promise<{
  target: Target;
  nodes: ProxyNode[];
  content: string;
  warnings: string[];
  dropped: DroppedNodeInfo[];
  inputCount: number;
  sourceStats: SourceBuildStat[];
  trace: ProcessorTraceStep[];
  resolveSourceName: (node: ProxyNode) => string | undefined;
}> {
  const collected = await resolveSourcesByIds(params.sourceIds, params.target);
  const warnings = [...collected.warnings];
  const trace: ProcessorTraceStep[] = [];
  const processed = await applyProcessors(collected.nodes, params.processors, params.target, {
    onWarning: (message) => warnings.push(message),
    onStep: (step) => trace.push(step),
    resolveSourceName: collected.resolveSourceName,
  });
  const produced = produce(processed, params.target);
  return {
    target: params.target,
    nodes: processed,
    content: produced.content,
    warnings: [...warnings, ...produced.warnings],
    dropped: produced.dropped,
    inputCount: collected.inputCount,
    sourceStats: collected.sourceStats,
    trace,
    resolveSourceName: collected.resolveSourceName,
  };
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
  dropped: DroppedNodeInfo[];
  inputCount: number;
  sourceStats: SourceBuildStat[];
  trace: ProcessorTraceStep[];
  resolveSourceName: (node: ProxyNode) => string | undefined;
}> {
  const output = findOutput(id);
  const target = targetOverride ?? output.target;
  const linked = db
    .select({ sourceId: outputSources.sourceId })
    .from(outputSources)
    .where(eq(outputSources.outputId, output.id))
    .orderBy(asc(outputSources.position))
    .all();
  const built = await executePipeline({
    sourceIds: linked.map((item) => item.sourceId),
    processors: output.processors ?? [],
    target,
  });
  return { output, ...built };
}

export async function previewOutput(id: number, target?: Target): Promise<PreviewDto> {
  const built = await buildOutput(id, target);
  return {
    target: built.target,
    count: built.nodes.length,
    inputCount: built.inputCount,
    sourceStats: built.sourceStats,
    trace: built.trace,
    dropped: built.dropped,
    nodes: toPreviewNodes(built.nodes, built.resolveSourceName),
    content: built.content,
    warnings: built.warnings,
  };
}

export async function dryRunOutput(input: OutputDryRunInput): Promise<PreviewDto> {
  const built = await executePipeline({
    sourceIds: input.sourceIds,
    processors: input.processors,
    target: input.target,
  });
  return {
    target: built.target,
    count: built.nodes.length,
    inputCount: built.inputCount,
    sourceStats: built.sourceStats,
    trace: built.trace,
    dropped: built.dropped,
    nodes: toPreviewNodes(built.nodes, built.resolveSourceName),
    content: built.content,
    warnings: built.warnings,
  };
}
