import { shareCreateSchema, shareUpdateSchema } from '@subhub/shared';
import type { FastifyInstance } from 'fastify';
import { badRequest } from '../errors.js';
import {
  createShare,
  deleteShare,
  listShares,
  updateShare,
} from '../services/share-service.js';

function parseId(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw badRequest('Invalid id');
  return id;
}

export default function registerShareRoutes(app: FastifyInstance): void {
  app.get('/api/shares', async () => listShares());

  app.post('/api/shares', async (request, reply) => {
    const input = shareCreateSchema.parse(request.body ?? {});
    return reply.status(201).send(createShare(input));
  });

  app.patch('/api/shares/:id', async (request) => {
    const { id } = request.params as { id: string };
    const input = shareUpdateSchema.parse(request.body);
    return updateShare(parseId(id), input);
  });

  app.delete('/api/shares/:id', async (request) => {
    const { id } = request.params as { id: string };
    deleteShare(parseId(id));
    return { ok: true };
  });
}
