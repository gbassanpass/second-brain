import { serve } from '@hono/node-server';
import { createApp } from './app.js';

const port = Number(process.env.APP_PORT ?? 3001);
const app = createApp();

serve({ fetch: app.fetch, port }, (info) => {
  console.info(`[backend] listening on http://localhost:${info.port}`);
});
