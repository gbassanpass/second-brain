import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { health } from './api/health.js';

export function createApp() {
  const app = new Hono();

  app.use('*', logger());

  app.route('/api/health', health);

  app.notFound((c) => c.json({ error: 'not_found' }, 404));

  app.onError((err, c) => {
    return c.json({ error: 'internal_error', message: err.message }, 500);
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
