import {
  outputCreateSchema,
  outputUpdateSchema,
  shareCreateSchema,
  shareUpdateSchema,
  targetSchema,
} from '@subhub/shared';
import type { FastifyInstance } from 'fastify';
import { badRequest } from '../errors.js';
import {
  createOutput,
  deleteOutput,
  getOutput,
  listOutputs,
  previewOutput,
  updateOutput,
} from '../services/output-service.js';
import {
  createShare,
  deleteShare,
  listShares,
  updateShareNote,
} from '../services/share-service.js';

function parseId(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw badRequest('Invalid id');
  return id;
}

export default function registerOutputRoutes(app: FastifyInstance): void {
  app.get('/api/outputs', async () => listOutputs());

  app.post('/api/outputs', async (request, reply) => {
    const input = outputCreateSchema.parse(request.body);
    const output = createOutput(input);
    return reply.status(201).send(output);
  });

  app.get('/api/outputs/:id', async (request) => {
    const { id } = request.params as { id: string };
    return getOutput(parseId(id));
  });

  app.patch('/api/outputs/:id', async (request) => {
    const { id } = request.params as { id: string };
    const input = outputUpdateSchema.parse(request.body);
    return updateOutput(parseId(id), input);
  });

  app.delete('/api/outputs/:id', async (request) => {
    const { id } = request.params as { id: string };
    deleteOutput(parseId(id));
    return { ok: true };
  });

  app.get('/api/outputs/:id/preview', async (request) => {
    const { id } = request.params as { id: string };
    const { target } = request.query as { target?: string };
    if (!target) return previewOutput(parseId(id));
    const parsed = targetSchema.safeParse(target);
    if (!parsed.success) throw badRequest(`Unsupported target: ${target}`);
    return previewOutput(parseId(id), parsed.data);
  });

  app.get('/api/outputs/:id/shares', async (request) => {
    const { id } = request.params as { id: string };
    return listShares(parseId(id));
  });

  app.post('/api/outputs/:id/shares', async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = shareCreateSchema.parse(request.body ?? {});
    const share = createShare(parseId(id), input);
    return reply.status(201).send(share);
  });

  app.patch('/api/shares/:id', async (request) => {
    const { id } = request.params as { id: string };
    const input = shareUpdateSchema.parse(request.body);
    return updateShareNote(parseId(id), input.note);
  });

  app.delete('/api/shares/:id', async (request) => {
    const { id } = request.params as { id: string };
    deleteShare(parseId(id));
    return { ok: true };
  });
}
