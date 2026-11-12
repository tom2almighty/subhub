import { and, eq, lt } from 'drizzle-orm';
import type { FastifyReply } from 'fastify';
import { db } from '../db/index.js';
import { sessions, type UserRow, users } from '../db/schema.js';
import { env } from '../env.js';
import { randomToken, sha256 } from './password.js';

export const SESSION_COOKIE = 'subhub_session';

export interface SessionInfo {
  token: string;
  expiresAt: Date;
}

export function createSession(userId: number): SessionInfo {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + env.sessionTtlDays * 24 * 60 * 60 * 1000);
  db.insert(sessions)
    .values({
      idHash: sha256(token),
      userId,
      expiresAt: expiresAt.toISOString(),
      createdAt: new Date().toISOString(),
    })
    .run();
  return { token, expiresAt };
}

export function getSessionUser(token: string | undefined): UserRow | null {
  if (!token) return null;
  const idHash = sha256(token);
  const row = db
    .select({ user: users, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.idHash, idHash))
    .get();
  if (!row) return null;
  if (new Date(row.expiresAt).getTime() <= Date.now()) {
    db.delete(sessions).where(eq(sessions.idHash, idHash)).run();
    return null;
  }
  return row.user;
}

export function deleteSession(token: string | undefined): void {
  if (!token) return;
  db.delete(sessions)
    .where(eq(sessions.idHash, sha256(token)))
    .run();
}

export function deleteExpiredSessions(): void {
  db.delete(sessions)
    .where(and(lt(sessions.expiresAt, new Date().toISOString())))
    .run();
}

export function setSessionCookie(reply: FastifyReply, session: SessionInfo): void {
  reply.setCookie(SESSION_COOKIE, session.token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: env.cookieSecure,
    expires: session.expiresAt,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}
