import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { createCreatorsRouter } from './api/creators.js';
import { health } from './api/health.js';
import type { Database } from './db/client.js';
import { getDb as getDbReal } from './db/client.js';

export interface AppDeps {
  /** Lazy DB accessor — called only when a route needs the database. Default: `getDb()` from db/client.js. */
  getDb?: () => Database;
}

export function createApp(deps: AppDeps = {}) {
  const app = new Hono();

  app.use('*', logger());

  app.route('/api/health', health);
  app.route('/api/creators', createCreatorsRouter(deps.getDb ?? getDbReal));

  app.notFound((c) => c.json({ error: 'not_found' }, 404));

  app.onError((err, c) => {
    return c.json({ error: 'internal_error', message: err.message }, 500);
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
