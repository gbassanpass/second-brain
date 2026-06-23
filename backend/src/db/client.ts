import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { schema } from './schema.js';

export type Database = ReturnType<typeof drizzle<typeof schema>>;

let _client: ReturnType<typeof postgres> | undefined;
let _db: Database | undefined;

/**
 * Conexão runtime usada pelos services/workers.
 * Usa o pooler do Supabase (`DATABASE_URL`).
 * Migrations rodam por um cliente próprio em `DATABASE_URL_DIRECT` (ver scripts).
 */
export function getDb(connectionString?: string): Database {
  if (_db) return _db;

  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required to connect to Postgres');
  }

  _client = postgres(url, {
    // pooler do Supabase está em modo transaction — desabilitar prepared statements.
    prepare: false,
    max: 10,
  });
  _db = drizzle(_client, { schema });
  return _db;
}

/** Fecha o pool (testes e shutdown). */
export async function closeDb(): Promise<void> {
  if (_client) {
    await _client.end({ timeout: 5 });
    _client = undefined;
    _db = undefined;
  }
}
