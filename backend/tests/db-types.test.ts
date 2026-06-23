import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { schema } from '../src/db/schema.js';
import {
  EMBEDDING_DIMENSIONS,
  chunksInsertSchema,
  chunksSelectSchema,
  consentsInsertSchema,
  creatorStatusSchema,
  creatorsInsertSchema,
  creatorsSelectSchema,
  documentsInsertSchema,
  embeddingVectorSchema,
  messageRoleSchema,
  messagesInsertSchema,
  retrievedChunksSchema,
  subscriptionsInsertSchema,
  tableSchemas,
  usersInsertSchema,
  usersSelectSchema,
} from '../src/db/types.js';

const uuid = '11111111-1111-4111-8111-111111111111';
const sha256Hex = 'a'.repeat(64);

describe('table schema catalog', () => {
  it('covers every table exported from src/db/schema.ts', () => {
    expect(new Set(Object.keys(tableSchemas))).toEqual(new Set(Object.keys(schema)));
  });

  it.each(Object.entries(tableSchemas))(
    '%s exposes insert + select Zod object schemas',
    (_name, schemas) => {
      expect(schemas.insert).toBeInstanceOf(z.ZodObject);
      expect(schemas.select).toBeInstanceOf(z.ZodObject);
    },
  );
});

describe('creators', () => {
  it('accepts a minimal insert and rejects malformed slug', () => {
    const ok = creatorsInsertSchema.safeParse({
      slug: 'fausto',
      displayName: 'Fausto Bassan',
    });
    expect(ok.success).toBe(true);

    const bad = creatorsInsertSchema.safeParse({
      slug: 'Has UpperCase',
      displayName: 'x',
    });
    expect(bad.success).toBe(false);
  });

  it('select schema enforces enum on status', () => {
    const ok = creatorsSelectSchema.safeParse({
      id: uuid,
      slug: 'fausto',
      displayName: 'Fausto Bassan',
      niche: null,
      ownerUserId: null,
      personaCard: null,
      voiceId: null,
      status: 'active',
      createdAt: new Date(),
    });
    expect(ok.success).toBe(true);

    expect(creatorStatusSchema.safeParse('weird').success).toBe(false);
  });
});

describe('users', () => {
  it('rejects malformed emails', () => {
    expect(
      usersInsertSchema.safeParse({ externalId: 'auth_1', email: 'not-an-email' }).success,
    ).toBe(false);
    expect(usersInsertSchema.safeParse({ externalId: 'auth_1', email: null }).success).toBe(true);
  });

  it('select schema validates role enum', () => {
    expect(
      usersSelectSchema.safeParse({
        id: uuid,
        externalId: null,
        email: null,
        role: 'subscriber',
        createdAt: new Date(),
      }).success,
    ).toBe(true);
    expect(
      usersSelectSchema.safeParse({
        id: uuid,
        externalId: null,
        email: null,
        role: 'admin',
        createdAt: new Date(),
      }).success,
    ).toBe(false);
  });
});

describe('consents', () => {
  it('only accepts the documented kinds (content|voice|likeness)', () => {
    expect(consentsInsertSchema.safeParse({ creatorId: uuid, kind: 'content' }).success).toBe(true);
    expect(consentsInsertSchema.safeParse({ creatorId: uuid, kind: 'random' }).success).toBe(false);
  });
});

describe('documents', () => {
  it('requires a 64-hex content_hash and non-empty raw_text', () => {
    expect(
      documentsInsertSchema.safeParse({
        creatorId: uuid,
        rawText: 'olá mundo',
        contentHash: sha256Hex,
      }).success,
    ).toBe(true);

    expect(
      documentsInsertSchema.safeParse({
        creatorId: uuid,
        rawText: '',
        contentHash: sha256Hex,
      }).success,
    ).toBe(false);

    expect(
      documentsInsertSchema.safeParse({
        creatorId: uuid,
        rawText: 'x',
        contentHash: 'too-short',
      }).success,
    ).toBe(false);
  });
});

describe('chunks', () => {
  it(`enforces a ${EMBEDDING_DIMENSIONS}-d embedding when provided`, () => {
    const validEmbedding = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.1);
    const ok = chunksInsertSchema.safeParse({
      creatorId: uuid,
      documentId: uuid,
      ordinal: 0,
      text: 'um trecho',
      embedding: validEmbedding,
    });
    expect(ok.success).toBe(true);

    const wrongDim = chunksInsertSchema.safeParse({
      creatorId: uuid,
      documentId: uuid,
      ordinal: 0,
      text: 'x',
      embedding: [0.1, 0.2],
    });
    expect(wrongDim.success).toBe(false);
  });

  it('accepts null embedding/tsv on insert (worker fills them later)', () => {
    expect(
      chunksInsertSchema.safeParse({
        creatorId: uuid,
        documentId: uuid,
        ordinal: 0,
        text: 'x',
      }).success,
    ).toBe(true);
  });

  it('select schema returns embedding as a plain number array (no driver string)', () => {
    const sample = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0.0);
    expect(embeddingVectorSchema.parse(sample)).toHaveLength(EMBEDDING_DIMENSIONS);
    const row = chunksSelectSchema.parse({
      id: uuid,
      creatorId: uuid,
      documentId: uuid,
      ordinal: 0,
      text: 't',
      embedding: sample,
      tsv: "'oi':1",
      topic: null,
      tokenCount: 42,
      createdAt: new Date(),
    });
    expect(row.embedding).toEqual(sample);
  });
});

describe('messages', () => {
  it('locks the role enum and validates retrieved_chunks shape', () => {
    expect(messageRoleSchema.options).toEqual(['user', 'assistant']);

    const ok = messagesInsertSchema.safeParse({
      conversationId: uuid,
      creatorId: uuid,
      role: 'assistant',
      content: 'olá',
      retrievedChunks: [{ chunkId: uuid, score: 0.8, documentId: uuid, rank: 0 }],
      guardrailFlag: 'none',
    });
    expect(ok.success).toBe(true);

    const badRole = messagesInsertSchema.safeParse({
      conversationId: uuid,
      creatorId: uuid,
      role: 'system',
      content: 'x',
    });
    expect(badRole.success).toBe(false);

    const badChunks = retrievedChunksSchema.safeParse([{ chunkId: 'not-uuid', score: 0.1 }]);
    expect(badChunks.success).toBe(false);
  });
});

describe('subscriptions', () => {
  it('limits plan/status/provider to documented enums', () => {
    const ok = subscriptionsInsertSchema.safeParse({
      creatorId: uuid,
      userId: uuid,
      plan: 'pro',
      status: 'active',
      provider: 'stripe',
    });
    expect(ok.success).toBe(true);

    const bad = subscriptionsInsertSchema.safeParse({
      creatorId: uuid,
      userId: uuid,
      plan: 'enterprise',
      status: 'active',
    });
    expect(bad.success).toBe(false);
  });
});
