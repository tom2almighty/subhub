import { createApp } from './app.js';
import { sqlite } from './db/index.js';
import { migrate } from './db/migrate.js';
import { env } from './env.js';
import { startScheduler, stopScheduler } from './services/scheduler.js';

migrate();

const app = await createApp();
startScheduler(app.log);

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, 'shutting down');
  stopScheduler();
  try {
    await app.close();
  } finally {
    sqlite.pragma('wal_checkpoint(TRUNCATE)');
    sqlite.close();
    process.exit(0);
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ host: env.host, port: env.port });
