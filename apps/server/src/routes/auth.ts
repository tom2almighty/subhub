import { changePasswordSchema, loginSchema } from '@subhub/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { hashPassword, verifyPassword } from '../auth/password.js';
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  SESSION_COOKIE,
  setSessionCookie,
} from '../auth/session.js';
import { db } from '../db/index.js';
import { sessions, users } from '../db/schema.js';
import { badRequest, unauthorized } from '../errors.js';

export default function registerAuthRoutes(app: FastifyInstance): void {
  app.post(
    '/api/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = loginSchema.parse(request.body);
      const user = db.select().from(users).get();
      if (!user || !verifyPassword(body.password, user.passwordHash)) {
        throw unauthorized('Invalid password');
      }
      const session = createSession(user.id);
      setSessionCookie(reply, session);
      return { authenticated: true };
    },
  );

  app.post('/api/auth/logout', async (request, reply) => {
    deleteSession(request.cookies[SESSION_COOKIE]);
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get('/api/auth/me', async () => {
    return { authenticated: true };
  });

  app.post('/api/auth/password', async (request, reply) => {
    const body = changePasswordSchema.parse(request.body);
    const user = request.user;
    if (!user) throw unauthorized();
    if (!verifyPassword(body.currentPassword, user.passwordHash)) {
      throw badRequest('Current password is incorrect', 'INVALID_PASSWORD');
    }
    db.update(users)
      .set({ passwordHash: hashPassword(body.newPassword) })
      .where(eq(users.id, user.id))
      .run();
    db.delete(sessions).where(eq(sessions.userId, user.id)).run();
    const session = createSession(user.id);
    setSessionCookie(reply, session);
    return { ok: true };
  });
}
