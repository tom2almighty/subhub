import type { UserRow } from './db/schema.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: UserRow;
  }
}
