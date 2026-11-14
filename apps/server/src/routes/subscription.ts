import { type Target, targetSchema } from '@subhub/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { db } from '../db/index.js';
import { outputSources, outputs, type SourceRow, sources } from '../db/schema.js';
import { computeEtag, getCachedSubscription, setCachedSubscription } from '../services/cache.js';
import { mergeFlows, toFlowHeader } from '../services/flow.js';
import { buildOutput, findOutputByToken } from '../services/output-service.js';
import { consumeShare, findShare } from '../services/share-service.js';
import { buildSource, findSource, findSourceByToken } from '../services/source-service.js';

const CONTENT_TYPES: Record<Target, string> = {
  surge: 'text/plain; charset=utf-8',
  loon: 'text/plain; charset=utf-8',
  qx: 'text/plain; charset=utf-8',
  uri: 'text/plain; charset=utf-8',
  shadowrocket: 'text/plain; charset=utf-8',
  mihomo: 'text/yaml; charset=utf-8',
  stash: 'text/yaml; charset=utf-8',
  egern: 'text/yaml; charset=utf-8',
  singbox: 'application/json; charset=utf-8',
  json: 'application/json; charset=utf-8',
};

const EXTENSIONS: Record<Target, string> = {
  surge: 'conf',
  loon: 'conf',
  qx: 'conf',
  uri: 'txt',
  shadowrocket: 'txt',
  mihomo: 'yaml',
  stash: 'yaml',
  egern: 'yaml',
  singbox: 'json',
  json: 'json',
};

/**
 * Returns undefined when no target is requested, null when the value is not
 * supported, and the parsed target otherwise.
 */
function parseTargetQuery(query: unknown): Target | undefined | null {
  const raw = (query as { target?: unknown } | undefined)?.target;
  if (raw === undefined || raw === '') return undefined;
  if (typeof raw !== 'string') return null;
  const parsed = targetSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function wantsDownload(query: unknown): boolean {
  const raw = (query as { download?: unknown } | undefined)?.download;
  if (typeof raw !== 'string') return true;
  return raw !== '0' && raw.toLowerCase() !== 'false';
}

function sendSubscription(
  request: FastifyRequest,
  reply: FastifyReply,
  name: string,
  target: Target,
  content: string,
  flowHeader: string | undefined,
  download: boolean,
  etag?: string,
): void {
  const computedEtag = etag ?? computeEtag(content);
  const ifNoneMatch = request.headers['if-none-match'];
  if (ifNoneMatch && ifNoneMatch === computedEtag) {
    reply.header('etag', computedEtag).status(304).send();
    return;
  }
  reply
    .header('content-type', CONTENT_TYPES[target])
    .header('cache-control', 'no-store')
    .header('etag', computedEtag)
    .header('profile-update-interval', '24')
    .header(
      'content-disposition',
      `${download ? 'attachment' : 'inline'}; filename="${encodeURIComponent(name)}.${EXTENSIONS[target]}"`,
    );
  if (flowHeader) reply.header('subscription-userinfo', flowHeader);
  reply.send(content);
}

async function sendOutput(
  request: FastifyRequest,
  reply: FastifyReply,
  outputId: number,
  targetOverride: Target | undefined,
  download: boolean,
): Promise<boolean> {
  const output = findOutputByIdOrThrow(outputId);
  if (!output.enabled) {
    reply.status(404).type('text/plain').send('Not Found');
    return false;
  }
  const resolvedTarget = targetOverride ?? output.target;
  const cacheKey = `output:${output.id}:${resolvedTarget}`;
  const cached = getCachedSubscription(cacheKey);
  if (cached) {
    sendSubscription(
      request,
      reply,
      cached.filename,
      resolvedTarget,
      cached.content,
      cached.flowHeader,
      download,
      cached.etag,
    );
    return true;
  }

  const built = await buildOutput(outputId, targetOverride);
  const linkedFlows = db
    .select({ flow: sources.flow })
    .from(outputSources)
    .innerJoin(sources, eq(sources.id, outputSources.sourceId))
    .where(eq(outputSources.outputId, built.output.id))
    .all()
    .map((item) => item.flow);
  const flowHeader = toFlowHeader(mergeFlows(linkedFlows));
  const entry = setCachedSubscription(cacheKey, {
    filename: built.output.name,
    content: built.content,
    flowHeader,
  });
  sendSubscription(
    request,
    reply,
    built.output.name,
    built.target,
    built.content,
    flowHeader,
    download,
    entry.etag,
  );
  return true;
}

function findOutputByIdOrThrow(outputId: number) {
  const row = db.select().from(outputs).where(eq(outputs.id, outputId)).get();
  if (!row) throw new Error('Output not found');
  return row;
}

async function sendSource(
  request: FastifyRequest,
  reply: FastifyReply,
  source: SourceRow,
  targetOverride: Target | undefined,
  download: boolean,
): Promise<boolean> {
  if (!source.enabled) {
    reply.status(404).type('text/plain').send('Not Found');
    return false;
  }
  const built = await buildSource(source, targetOverride);
  const cacheKey = `source:${source.id}:${built.target}`;
  const flowHeader = toFlowHeader(source.flow ?? null);
  const entry = setCachedSubscription(cacheKey, {
    filename: source.name,
    content: built.content,
    flowHeader,
  });
  sendSubscription(
    request,
    reply,
    source.name,
    built.target,
    built.content,
    flowHeader,
    download,
    entry.etag,
  );
  return true;
}

function logFailure(request: FastifyRequest, error: unknown, token: string): void {
  request.log.warn({ err: error, tokenPrefix: token.slice(0, 6) }, 'subscription request failed');
}

export default function registerSubscriptionRoutes(app: FastifyInstance): void {
  app.get('/__sub/private/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const target = parseTargetQuery(request.query);
    const download = wantsDownload(request.query);
    if (target === null) {
      return reply.status(400).type('text/plain').send('Unsupported target');
    }
    try {
      const output = tryFindOutput(token);
      if (output) {
        await sendOutput(request, reply, output.id, target, download);
        return;
      }
      const source = findSourceByToken(token);
      await sendSource(request, reply, source, target, download);
    } catch (error) {
      logFailure(request, error, token);
      reply.status(404).type('text/plain').send('Not Found');
    }
  });

  app.get('/__sub/share/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const target = parseTargetQuery(request.query);
    const download = wantsDownload(request.query);
    if (target === null) {
      return reply.status(400).type('text/plain').send('Unsupported target');
    }
    try {
      const share = findShare(token);
      const allowed = share.allowedTargets ?? [];
      if (target && allowed.length > 0 && !allowed.includes(target)) {
        return reply.status(403).type('text/plain').send('Target not allowed for this share');
      }
      const effectiveTarget = target ?? (allowed.length === 1 ? allowed[0] : undefined);
      const sent =
        share.kind === 'output'
          ? await sendOutput(request, reply, share.targetId, effectiveTarget, download)
          : await sendSource(
              request,
              reply,
              findSource(share.targetId),
              effectiveTarget,
              download,
            );
      if (sent && request.method !== 'HEAD') consumeShare(token);
    } catch (error) {
      logFailure(request, error, token);
      reply.status(404).type('text/plain').send('Not Found');
    }
  });
}

function tryFindOutput(token: string) {
  try {
    return findOutputByToken(token);
  } catch {
    return null;
  }
}
