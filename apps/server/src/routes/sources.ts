import { inspectNodes } from '@subhub/proxy-core';
import { parseInspectSchema, sourceCreateSchema, sourceUpdateSchema } from '@subhub/shared';
import type { FastifyInstance } from 'fastify';
import { badRequest } from '../errors.js';
import {
  createSource,
  deleteSource,
  getSource,
  getSourceNodes,
  listSources,
  refreshAllSources,
  refreshSource,
  updateSource,
} from '../services/source-service.js';

function parseId(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw badRequest('Invalid id');
  return id;
}

export default function registerSourceRoutes(app: FastifyInstance): void {
  app.post('/api/parse/inspect', async (request) => {
    const { content } = parseInspectSchema.parse(request.body ?? {});
    return inspectNodes(content);
  });

  app.get('/api/sources', async () => listSources());

  app.post('/api/sources', async (request, reply) => {
    const input = sourceCreateSchema.parse(request.body);
    const source = createSource(input);
    return reply.status(201).send(source);
  });

  app.get('/api/sources/:id', async (request) => {
    const { id } = request.params as { id: string };
    return getSource(parseId(id));
  });

  app.patch('/api/sources/:id', async (request) => {
    const { id } = request.params as { id: string };
    const input = sourceUpdateSchema.parse(request.body);
    return updateSource(parseId(id), input);
  });

  app.delete('/api/sources/:id', async (request) => {
    const { id } = request.params as { id: string };
    deleteSource(parseId(id));
    return { ok: true };
  });

  app.post('/api/sources/refresh-all', async () => refreshAllSources());

  app.post('/api/sources/:id/refresh', async (request) => {
    const { id } = request.params as { id: string };
    return refreshSource(parseId(id), { force: true });
  });

  app.get('/api/sources/:id/nodes', async (request) => {
    const { id } = request.params as { id: string };
    return getSourceNodes(parseId(id));
  });
}
