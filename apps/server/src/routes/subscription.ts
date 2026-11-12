import { type Target, targetSchema } from '@subhub/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { db } from '../db/index.js';
import { outputSources, sources } from '../db/schema.js';
import { mergeFlows, toFlowHeader } from '../services/flow.js';
import { buildOutput, findOutputByToken } from '../services/output-service.js';
import { consumeShare, findShare } from '../services/share-service.js';

const CONTENT_TYPES: Record<Target, string> = {
  surge: 'text/plain; charset=utf-8',
  loon: 'text/plain; charset=utf-8',
  qx: 'text/plain; charset=utf-8',
  uri: 'text/plain; charset=utf-8',
  shadowrocket: 'text/plain; charset=utf-8',
  mihomo: 'text/yaml; charset=utf-8',
  stash: 'text/yaml; charset=utf-8',
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

async function sendOutput(
  reply: FastifyReply,
  outputId: number,
  targetOverride: Target | undefined,
): Promise<boolean> {
  const built = await buildOutput(outputId, targetOverride);
  if (!built.output.enabled) {
    reply.status(404).type('text/plain').send('Not Found');
    return false;
  }
  const linkedFlows = db
    .select({ flow: sources.flow })
    .from(outputSources)
    .innerJoin(sources, eq(sources.id, outputSources.sourceId))
    .where(eq(outputSources.outputId, built.output.id))
    .all()
    .map((item) => item.flow);
  const flowHeader = toFlowHeader(mergeFlows(linkedFlows));

  reply
    .header('content-type', CONTENT_TYPES[built.target])
    .header('cache-control', 'no-store')
    .header('profile-update-interval', '24')
    .header(
      'content-disposition',
      `attachment; filename="${encodeURIComponent(built.output.name)}.${EXTENSIONS[built.target]}"`,
    );
  if (flowHeader) reply.header('subscription-userinfo', flowHeader);
  reply.send(built.content);
  return true;
}

function logFailure(request: FastifyRequest, error: unknown, token: string): void {
  request.log.warn({ err: error, tokenPrefix: token.slice(0, 6) }, 'subscription request failed');
}

export default function registerSubscriptionRoutes(app: FastifyInstance): void {
  app.get('/__sub/private/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const target = parseTargetQuery(request.query);
    if (target === null) {
      return reply.status(400).type('text/plain').send('Unsupported target');
    }
    try {
      const output = findOutputByToken(token);
      await sendOutput(reply, output.id, target);
    } catch (error) {
      logFailure(request, error, token);
      reply.status(404).type('text/plain').send('Not Found');
    }
  });

  app.get('/__sub/share/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const target = parseTargetQuery(request.query);
    if (target === null) {
      return reply.status(400).type('text/plain').send('Unsupported target');
    }
    try {
      const share = findShare(token);
      const sent = await sendOutput(reply, share.outputId, target);
      if (sent && request.method !== 'HEAD') consumeShare(token);
    } catch (error) {
      logFailure(request, error, token);
      reply.status(404).type('text/plain').send('Not Found');
    }
  });
}
