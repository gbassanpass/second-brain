import { afterEach, describe, expect, it } from 'vitest';
import { ConfigError, loadConfig, resetConfigForTests } from '../src/config.js';

afterEach(() => {
  resetConfigForTests();
});

const validDevEnv = () => ({
  APP_ENV: 'dev',
  APP_PORT: '3001',
  APP_SECRET: 'secret-xyz',
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  SUPABASE_JWT_SECRET: 'jwt-secret-with-32-chars-minimum-padding',
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:54322/postgres',
  DATABASE_URL_DIRECT: 'postgresql://postgres:postgres@localhost:54322/postgres',
  REDIS_URL: 'redis://localhost:6379/0',
});

describe('loadConfig', () => {
  it('uses fake defaults when APP_ENV=test', () => {
    const cfg = loadConfig({ APP_ENV: 'test' });
    expect(cfg.APP_ENV).toBe('test');
    expect(cfg.APP_SECRET).toMatch(/^fake-test-/);
    expect(cfg.SUPABASE_URL).toMatch(/^http/);
    expect(cfg.DATABASE_URL).toContain('postgres');
    expect(cfg.REDIS_URL).toContain('redis://');
    expect(cfg.ANTHROPIC_API_KEY).toMatch(/^fake-test-/);
    expect(cfg.OPENAI_API_KEY).toMatch(/^fake-test-/);
    expect(cfg.COHERE_API_KEY).toMatch(/^fake-test-/);
    expect(cfg.DEEPGRAM_API_KEY).toMatch(/^fake-test-/);
    expect(cfg.LLM_PROVIDER).toBe('fake');
    expect(cfg.EMBEDDINGS_PROVIDER).toBe('fake');
    expect(cfg.RERANK_PROVIDER).toBe('fake');
    expect(cfg.TRANSCRIPTION_PROVIDER).toBe('fake');
  });

  it('falls back to APP_ENV=test when only NODE_ENV=test is set', () => {
    const cfg = loadConfig({ NODE_ENV: 'test' });
    expect(cfg.APP_ENV).toBe('test');
    expect(cfg.APP_SECRET).toMatch(/^fake-test-/);
  });

  it('throws ConfigError listing missing required envs in dev', () => {
    let caught: unknown;
    try {
      loadConfig({ APP_ENV: 'dev' });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ConfigError);
    const message = (caught as Error).message;
    expect(message).toContain('APP_SECRET');
    expect(message).toContain('SUPABASE_URL');
    expect(message).toContain('SUPABASE_ANON_KEY');
    expect(message).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(message).toContain('SUPABASE_JWT_SECRET');
    expect(message).toContain('DATABASE_URL');
    expect(message).toContain('DATABASE_URL_DIRECT');
    expect(message).toContain('REDIS_URL');
    expect(message).toContain('docs/08-setup-and-env.md');
  });

  it('accepts a fully-populated dev env and keeps provider keys optional', () => {
    const cfg = loadConfig(validDevEnv());
    expect(cfg.APP_ENV).toBe('dev');
    expect(cfg.APP_PORT).toBe(3001);
    expect(cfg.LLM_PROVIDER).toBe('anthropic');
    expect(cfg.EMBEDDINGS_PROVIDER).toBe('openai');
    expect(cfg.RERANK_PROVIDER).toBe('cohere');
    expect(cfg.TRANSCRIPTION_PROVIDER).toBe('deepgram');
    expect(cfg.ANTHROPIC_API_KEY).toBe('');
    expect(cfg.OPENAI_API_KEY).toBe('');
    expect(cfg.COHERE_API_KEY).toBe('');
    expect(cfg.MAX_TOKENS_PER_REPLY).toBe(800);
    expect(cfg.RETRIEVAL_TOP_K).toBe(5);
    expect(cfg.RERANK_SCORE_THRESHOLD).toBeCloseTo(0.2);
  });

  it('coerces numeric envs and enforces ranges', () => {
    const cfg = loadConfig({
      APP_ENV: 'test',
      APP_PORT: '4000',
      MAX_TOKENS_PER_REPLY: '1200',
      RETRIEVAL_TOP_K: '8',
      RERANK_SCORE_THRESHOLD: '0.5',
    });
    expect(cfg.APP_PORT).toBe(4000);
    expect(cfg.MAX_TOKENS_PER_REPLY).toBe(1200);
    expect(cfg.RETRIEVAL_TOP_K).toBe(8);
    expect(cfg.RERANK_SCORE_THRESHOLD).toBe(0.5);

    expect(() => loadConfig({ APP_ENV: 'test', RERANK_SCORE_THRESHOLD: '2' })).toThrow(ConfigError);
    expect(() => loadConfig({ APP_ENV: 'test', APP_PORT: '0' })).toThrow(ConfigError);
  });

  it('rejects an unknown APP_ENV with a clear message', () => {
    expect(() => loadConfig({ APP_ENV: 'production' })).toThrow(/Invalid APP_ENV/);
  });

  it('lets explicit env values override provider defaults', () => {
    const cfg = loadConfig({
      ...validDevEnv(),
      LLM_DEFAULT_MODEL: 'claude-sonnet',
      RETRIEVAL_TOP_K: '10',
      ANTHROPIC_API_KEY: 'sk-real-key',
    });
    expect(cfg.LLM_DEFAULT_MODEL).toBe('claude-sonnet');
    expect(cfg.RETRIEVAL_TOP_K).toBe(10);
    expect(cfg.ANTHROPIC_API_KEY).toBe('sk-real-key');
  });
});
