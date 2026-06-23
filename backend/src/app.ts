import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { createCreatorsRouter } from './api/creators.js';
import { health } from './api/health.js';
import { type EnqueueSyncFn, createSourcesRouter } from './api/sources.js';
import type { Database } from './db/client.js';
import { getDb as getDbReal } from './db/client.js';
import { enqueueIngestSync } from './workers/queue.js';

const defaultEnqueueSync: EnqueueSyncFn = (sourceId) => enqueueIngestSync(sourceId);

export interface AppDeps {
  /** Lazy DB accessor — called only when a route needs the database. Default: `getDb()` from db/client.js. */
  getDb?: () => Database;
  /** Lazy BullMQ enqueue — called only by `POST /api/sources/:id/sync`. */
  enqueueSync?: EnqueueSyncFn;
}

export function createApp(deps: AppDeps = {}) {
  const app = new Hono();
  const getDb = deps.getDb ?? getDbReal;

  app.use('*', logger());

  app.route('/api/health', health);
  app.route('/api/creators', createCreatorsRouter(getDb));
  app.route('/api/sources', createSourcesRouter(getDb, deps.enqueueSync ?? defaultEnqueueSync));

  app.notFound((c) => c.json({ error: 'not_found' }, 404));

  app.onError((err, c) => {
    return c.json({ error: 'internal_error', message: err.message }, 500);
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
