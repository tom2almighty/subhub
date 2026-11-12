import { existsSync } from 'node:fs';
import path from 'node:path';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, LogController } from 'fastify';
import { ZodError } from 'zod';
import { getSessionUser, SESSION_COOKIE } from './auth/session.js';
import { env } from './env.js';
import { ApiError } from './errors.js';
import registerAuthRoutes from './routes/auth.js';
import registerHealthRoute from './routes/health.js';
import registerOutputRoutes from './routes/outputs.js';
import registerSettingsRoutes from './routes/settings.js';
import registerSourceRoutes from './routes/sources.js';
import registerSubscriptionRoutes from './routes/subscription.js';
import { getSubscriptionPaths } from './services/settings-service.js';

const PUBLIC_API = new Set(['/api/health', '/api/auth/login']);

function rewriteSubscriptionUrl(url: string): string {
  const queryIndex = url.indexOf('?');
  const pathname = queryIndex === -1 ? url : url.slice(0, queryIndex);
  const match = /^\/([^/]+)\/([^/]+)$/.exec(pathname);
  if (!match) return url;
  const [, prefix, token] = match;
  if (!prefix || !token) return url;
  const paths = getSubscriptionPaths();
  const search = queryIndex === -1 ? '' : url.slice(queryIndex);
  if (prefix === paths.privatePath) return `/__sub/private/${token}${search}`;
  if (prefix === paths.sharePath) return `/__sub/share/${token}${search}`;
  return url;
}

export async function createApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.logLevel,
      redact: {
        paths: [
          'req.headers.cookie',
          'req.headers.authorization',
          'req.query.token',
          'req.headers["x-subhub-request"]',
        ],
        censor: '[redacted]',
      },
    },
    trustProxy: env.trustProxy,
    bodyLimit: 20 * 1024 * 1024,
    logController: new LogController({ disableRequestLogging: env.isProduction }),
    rewriteUrl: (request) => rewriteSubscriptionUrl(request.url ?? '/'),
  });

  await app.register(cookie);
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });

  app.addHook('onRequest', async (request, reply) => {
    const pathname = (request.raw.url ?? '').split('?')[0] ?? '';
    if (!pathname.startsWith('/api/')) return;
    const safeMethod = ['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    if (!safeMethod && request.headers['x-subhub-request'] !== '1') {
      return reply.status(403).send({ code: 'FORBIDDEN', message: 'Missing request header' });
    }
    if (PUBLIC_API.has(pathname)) return;
    const user = getSessionUser(request.cookies[SESSION_COOKIE]);
    if (!user) {
      return reply.status(401).send({ code: 'UNAUTHORIZED', message: 'Authentication required' });
    }
    request.user = user;
  });

  app.setErrorHandler((error, request, reply) => {
    const err = error as Error & { statusCode?: number };
    if (err instanceof ApiError) {
      return reply.status(err.statusCode).send({ code: err.code, message: err.message });
    }
    if (err instanceof ZodError) {
      const message = err.issues
        .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
        .join('; ');
      return reply.status(400).send({ code: 'VALIDATION_ERROR', message });
    }
    if (typeof err.statusCode === 'number' && err.statusCode < 500) {
      return reply
        .status(err.statusCode)
        .send({ code: 'BAD_REQUEST', message: err.message ?? 'Bad request' });
    }
    request.log.error({ err }, 'request failed');
    return reply.status(500).send({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
  });

  registerHealthRoute(app);
  registerAuthRoutes(app);
  registerSourceRoutes(app);
  registerOutputRoutes(app);
  registerSettingsRoutes(app);
  registerSubscriptionRoutes(app);

  const indexHtml = path.join(env.webDist, 'index.html');
  const hasWeb = existsSync(indexHtml);
  if (hasWeb) {
    await app.register(fastifyStatic, {
      root: env.webDist,
      prefix: '/',
      wildcard: false,
      setHeaders(response, filePath) {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          response.header('cache-control', 'public, max-age=31536000, immutable');
        } else {
          response.header('cache-control', 'no-cache');
        }
      },
    });
  }

  app.setNotFoundHandler((request, reply) => {
    const pathname = (request.raw.url ?? '').split('?')[0] ?? '';
    const segments = pathname.split('/').filter(Boolean);
    const isPage =
      segments.length <= 1 ||
      (segments.length === 2 && (segments[0] === 'sources' || segments[0] === 'outputs'));
    if (hasWeb && isPage && (request.method === 'GET' || request.method === 'HEAD')) {
      return reply.sendFile('index.html');
    }
    return reply.status(404).send({ code: 'NOT_FOUND', message: 'Not found' });
  });

  return app;
}
