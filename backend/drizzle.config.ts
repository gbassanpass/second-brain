import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// Lê o .env da raiz do monorepo (um nível acima de /backend).
loadEnv({ path: new URL('../.env', import.meta.url).pathname });

const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL_DIRECT (or DATABASE_URL) must be set for drizzle-kit');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: '../infra/supabase/migrations',
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
