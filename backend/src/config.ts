import { z } from 'zod';

export const APP_ENVS = ['dev', 'test', 'staging', 'prod'] as const;
export type AppEnv = (typeof APP_ENVS)[number];

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

const FAKE_PREFIX = 'fake-test-';

// Fakes used when APP_ENV=test so the suite can boot without real provider keys.
// Adapters in E0.4 will still gate by provider="fake" before issuing network calls.
const FAKES = {
  APP_SECRET: `${FAKE_PREFIX}app-secret`,
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_ANON_KEY: `${FAKE_PREFIX}supabase-anon`,
  SUPABASE_SERVICE_ROLE_KEY: `${FAKE_PREFIX}supabase-service-role`,
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:54322/postgres',
  DATABASE_URL_DIRECT: 'postgresql://postgres:postgres@localhost:54322/postgres',
  REDIS_URL: 'redis://localhost:6379/0',
  ANTHROPIC_API_KEY: `${FAKE_PREFIX}anthropic`,
  OPENAI_API_KEY: `${FAKE_PREFIX}openai`,
  COHERE_API_KEY: `${FAKE_PREFIX}cohere`,
  DEEPGRAM_API_KEY: `${FAKE_PREFIX}deepgram`,
} as const;

type FakeKey = keyof typeof FAKES;

function buildSchema(isTest: boolean) {
  const requiredAtBoot = (key: FakeKey) =>
    isTest ? z.string().min(1).default(FAKES[key]) : z.string().min(1, `${key} is required`);

  // Provider keys are optional at boot in dev/prod; the adapter for the chosen
  // provider validates the key when it actually instantiates a client. In test
  // they are populated with fakes so adapter factories can still be exercised.
  const optionalProvider = (key: FakeKey) =>
    isTest ? z.string().default(FAKES[key]) : z.string().default('');

  const optionalString = z.string().default('');

  return z.object({
    APP_ENV: z.enum(APP_ENVS).default('dev'),
    APP_PORT: z.coerce.number().int().positive().default(3001),
    APP_SECRET: requiredAtBoot('APP_SECRET'),

    SUPABASE_URL: requiredAtBoot('SUPABASE_URL'),
    SUPABASE_ANON_KEY: requiredAtBoot('SUPABASE_ANON_KEY'),
    SUPABASE_SERVICE_ROLE_KEY: requiredAtBoot('SUPABASE_SERVICE_ROLE_KEY'),
    DATABASE_URL: requiredAtBoot('DATABASE_URL'),
    DATABASE_URL_DIRECT: requiredAtBoot('DATABASE_URL_DIRECT'),

    REDIS_URL: requiredAtBoot('REDIS_URL'),

    LLM_PROVIDER: z.enum(['anthropic', 'fake']).default(isTest ? 'fake' : 'anthropic'),
    LLM_DEFAULT_MODEL: z.string().min(1).default('claude-haiku-4-5'),
    LLM_FALLBACK_MODEL: z.string().min(1).default('claude-sonnet-4-6'),
    ANTHROPIC_API_KEY: optionalProvider('ANTHROPIC_API_KEY'),

    EMBEDDINGS_PROVIDER: z.enum(['openai', 'fake']).default(isTest ? 'fake' : 'openai'),
    EMBEDDING_MODEL: z.string().min(1).default('text-embedding-3-small'),
    OPENAI_API_KEY: optionalProvider('OPENAI_API_KEY'),

    RERANK_PROVIDER: z.enum(['cohere', 'fake']).default(isTest ? 'fake' : 'cohere'),
    RERANK_MODEL: z.string().min(1).default('rerank-v3.5'),
    COHERE_API_KEY: optionalProvider('COHERE_API_KEY'),

    TRANSCRIPTION_PROVIDER: z
      .enum(['deepgram', 'assemblyai', 'fake'])
      .default(isTest ? 'fake' : 'deepgram'),
    DEEPGRAM_API_KEY: optionalProvider('DEEPGRAM_API_KEY'),
    ASSEMBLYAI_API_KEY: optionalString,

    PHYLLO_CLIENT_ID: optionalString,
    PHYLLO_CLIENT_SECRET: optionalString,
    PHYLLO_ENV: z.enum(['sandbox', 'production']).default('sandbox'),

    ELEVENLABS_API_KEY: optionalString,

    STRIPE_SECRET_KEY: optionalString,
    STRIPE_WEBHOOK_SECRET: optionalString,

    MAX_TOKENS_PER_REPLY: z.coerce.number().int().positive().default(800),
    RETRIEVAL_TOP_K: z.coerce.number().int().positive().default(5),
    RERANK_SCORE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.2),

    // Routing (Haiku ↔ Sonnet) — see backend/src/rag/routing.ts.
    LLM_ROUTING_FORCE: z.enum(['default', 'fallback']).optional(),
    LLM_ROUTING_LONG_QUERY_CHARS: z.coerce.number().int().positive().default(280),
    LLM_ROUTING_LOW_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.3),
  });
}

const APP_ENV_SCHEMA = z.enum(APP_ENVS);

type EnvSource = Record<string, string | undefined>;

function detectAppEnv(env: EnvSource): AppEnv {
  const raw = env.APP_ENV ?? (env.NODE_ENV === 'test' ? 'test' : 'dev');
  const parsed = APP_ENV_SCHEMA.safeParse(raw);
  if (!parsed.success) {
    throw new ConfigError(`Invalid APP_ENV "${raw}". Must be one of: ${APP_ENVS.join(', ')}.`);
  }
  return parsed.data;
}

export type Config = z.infer<ReturnType<typeof buildSchema>>;

export function loadConfig(env: EnvSource = process.env): Config {
  const appEnv = detectAppEnv(env);
  const schema = buildSchema(appEnv === 'test');
  const result = schema.safeParse({ ...env, APP_ENV: appEnv });
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new ConfigError(
      `Invalid configuration (APP_ENV=${appEnv}):\n${issues}\n\nSee docs/08-setup-and-env.md and copy .env.example to .env.`,
    );
  }
  return result.data;
}

let cached: Config | undefined;

export function getConfig(): Config {
  if (!cached) cached = loadConfig();
  return cached;
}

export function resetConfigForTests(): void {
  cached = undefined;
}
