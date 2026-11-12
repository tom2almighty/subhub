import type { FastifyBaseLogger } from 'fastify';
import { deleteExpiredSessions } from '../auth/session.js';
import { dueSources, refreshSource } from './source-service.js';

let timer: NodeJS.Timeout | undefined;
let firstRun: NodeJS.Timeout | undefined;
let running = false;

async function tick(logger: FastifyBaseLogger): Promise<void> {
  if (running) return;
  running = true;
  try {
    deleteExpiredSessions();
    const due = dueSources();
    for (let index = 0; index < due.length; index += 3) {
      const chunk = due.slice(index, index + 3);
      await Promise.all(
        chunk.map(async (source) => {
          try {
            await refreshSource(source.id);
            logger.info({ source: source.name }, 'source refreshed');
          } catch (error) {
            logger.warn({ source: source.name, err: error }, 'source refresh failed');
          }
        }),
      );
    }
  } finally {
    running = false;
  }
}

export function startScheduler(logger: FastifyBaseLogger): void {
  if (timer) return;
  timer = setInterval(() => void tick(logger), 60_000);
  firstRun = setTimeout(() => void tick(logger), 10_000);
  timer.unref();
  firstRun.unref();
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer);
  if (firstRun) clearTimeout(firstRun);
  timer = undefined;
  firstRun = undefined;
}
