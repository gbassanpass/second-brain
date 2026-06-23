import { config as loadEnv } from 'dotenv';
import { ConfigError, getConfig } from '../config.js';
import { closeDb, getDb } from '../db/client.js';
import type { PersonaCard } from '../rag/persona.js';
import { ensureCreatorBySlug } from '../services/documents.js';
import { getPersonaCard, setPersonaCard } from '../services/persona.js';
import { ensureManualSource } from '../services/source-ingest.js';

loadEnv({ path: new URL('../../../.env', import.meta.url).pathname });

const FAUSTO_PERSONA: PersonaCard = {
  name: 'Fausto Bassan',
  one_liner: 'Explico o mundo sem torcer — política, ciência e fé.',
  voice: [
    'didático',
    'direto',
    'neutro/sem militância',
    'usa analogias',
    'fé como base de valores',
  ],
  frameworks: ['mostrar os interesses de cada lado', 'quem ganha o quê', 'fatos vs narrativa'],
  do: ['explicar acontecimentos sem viés', 'apoiar decisões de vida', 'refletir sobre fé e razão'],
  dont: ['recomendar compra/venda de ativos', 'tomar lado partidário', 'prometer ganho financeiro'],
  catchphrases: ['sem torcer', 'antes de escolher um vilão, pergunte quem ganha o quê'],
  disclaimer: 'Conteúdo educativo; não é recomendação de investimento.',
};

async function main() {
  let config: ReturnType<typeof getConfig>;
  try {
    config = getConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`\n[config] ${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }

  const db = getDb();
  console.info(`[seed] env=${config.APP_ENV}`);

  // Fausto creator (idempotent).
  const creator = await ensureCreatorBySlug(db, 'fausto', 'Fausto Bassan');
  console.info(`[seed] creator slug=fausto id=${creator.id}`);

  // Manual content source (idempotent).
  const source = await ensureManualSource(db, creator.id);
  console.info(`[seed] manual source id=${source.id}`);

  // Persona Card: skip if already set (don't trample Studio edits) unless
  // SEED_FORCE_PERSONA=1 is passed.
  const force = process.env.SEED_FORCE_PERSONA === '1';
  const existing = await getPersonaCard(db, 'fausto');
  if (existing && !force) {
    console.info('[seed] persona already set — skipping (SEED_FORCE_PERSONA=1 to overwrite)');
  } else {
    const result = await setPersonaCard(db, 'fausto', FAUSTO_PERSONA);
    if ('error' in result) {
      throw new Error(`setPersonaCard failed: ${result.error}`);
    }
    console.info(`[seed] persona ${existing ? 'overwritten' : 'set'} for fausto`);
  }
}

main()
  .catch((err: unknown) => {
    console.error('[seed] failed:', err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
