import {
  outputCreateSchema,
  outputDryRunSchema,
  outputUpdateSchema,
  targetSchema,
} from '@subhub/shared';
import type { FastifyInstance } from 'fastify';
import { badRequest } from '../errors.js';
import {
  createOutput,
  deleteOutput,
  dryRunOutput,
  getOutput,
  listOutputs,
  previewOutput,
  updateOutput,
} from '../services/output-service.js';

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

  app.post('/api/outputs/dry-run', async (request) => {
    const input = outputDryRunSchema.parse(request.body ?? {});
    return dryRunOutput(input);
  });

  app.get('/api/outputs/:id/preview', async (request) => {
    const { id } = request.params as { id: string };
    const { target } = request.query as { target?: string };
    if (!target) return previewOutput(parseId(id));
    const parsed = targetSchema.safeParse(target);
    if (!parsed.success) throw badRequest(`Unsupported target: ${target}`);
    return previewOutput(parseId(id), parsed.data);
  });
}
