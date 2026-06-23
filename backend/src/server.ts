import { serve } from '@hono/node-server';
import { config as loadEnv } from 'dotenv';
import { createApp } from './app.js';
import { ConfigError, getConfig } from './config.js';

// .env lives at the monorepo root (../../ from this file).
loadEnv({ path: new URL('../../.env', import.meta.url).pathname });

try {
  const config = getConfig();
  const app = createApp();
  serve({ fetch: app.fetch, port: config.APP_PORT }, (info) => {
    console.info(`[backend] listening on http://localhost:${info.port} (env=${config.APP_ENV})`);
  });
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(`\n[config] ${err.message}\n`);
    process.exit(1);
  }
  throw err;
}
