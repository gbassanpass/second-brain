import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import {
  accessCodes,
  accessGrants,
  consents,
  contentSources,
  conversations,
  creators,
  documents,
  kgEntities,
  kgRelations,
  messages,
  subscriptions,
  users,
} from './schema.js';

// ============================================================================
// Domain enums (textual columns whose accepted values are pinned in docs/04
// e docs/05). drizzle-zod gives `z.string()` for them by default because the
// columns are plain TEXT; we narrow here so the API surface fails fast.
// ============================================================================
export const creatorStatusSchema = z.enum(['active', 'paused', 'archived']);
export const userRoleSchema = z.enum(['subscriber', 'creator', 'operator']);
export const consentKindSchema = z.enum(['content', 'voice', 'likeness']);
export const contentSourceKindSchema = z.enum([
  'manual',
  'upload',
  'text',
  'instagram',
  'youtube',
  'tiktok',
  'phyllo',
]);
export const contentSourceStatusSchema = z.enum(['pending', 'indexing', 'indexed', 'error']);
export const documentKindSchema = z.enum([
  'reel',
  'video',
  'caption',
  'article',
  'transcript',
  'upload',
  'qa',
]);
export const messageRoleSchema = z.enum(['user', 'assistant']);
export const guardrailFlagSchema = z.enum(['none', 'investment', 'safety']);
export const subscriptionPlanSchema = z.enum(['basic', 'pro']);
export const subscriptionStatusSchema = z.enum([
  'active',
  'canceled',
  'past_due',
  'incomplete',
  'trialing',
]);
export const subscriptionProviderSchema = z.enum(['stripe', 'hotmart', 'kiwify']);

// Shape of `retrieved_chunks` in `messages` (auditoria das fontes citadas).
export const retrievedChunksSchema = z.array(
  z.object({
    chunkId: z.string().uuid(),
    score: z.number(),
    documentId: z.string().uuid().optional(),
    rank: z.number().int().nonnegative().optional(),
  }),
);

// EMBEDDING_DIMENSIONS deve casar com `vector('embedding', { dimensions: 1536 })`
// e com o modelo configurado por env (`text-embedding-3-small` no MVP).
export const EMBEDDING_DIMENSIONS = 1536;
export const embeddingVectorSchema = z.array(z.number().finite()).length(EMBEDDING_DIMENSIONS);

const slugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'slug must be lower-kebab-case');

const sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/, 'must be sha256 hex');
const nonNegativeInt = z.number().int().nonnegative();

// ============================================================================
// Per-table insert + select schemas.
// drizzle-zod auto-derives most columns; refines narrow strings to enums and
// give the unsupported pg types (vector + tsvector) real Zod shapes.
// ============================================================================

// ---- creators ----
export const creatorsInsertSchema = createInsertSchema(creators, {
  slug: slugSchema,
  displayName: z.string().min(1),
  status: creatorStatusSchema,
  personaCard: z.unknown(),
});
export const creatorsSelectSchema = createSelectSchema(creators, {
  slug: slugSchema,
  status: creatorStatusSchema,
  personaCard: z.unknown(),
});
export type CreatorInsert = z.infer<typeof creatorsInsertSchema>;
export type CreatorRow = z.infer<typeof creatorsSelectSchema>;

// ---- users ----
export const usersInsertSchema = createInsertSchema(users, {
  email: z.string().email().nullable().optional(),
  role: userRoleSchema,
});
export const usersSelectSchema = createSelectSchema(users, {
  email: z.string().email().nullable(),
  role: userRoleSchema,
});
export type UserInsert = z.infer<typeof usersInsertSchema>;
export type UserRow = z.infer<typeof usersSelectSchema>;

// ---- consents ----
export const consentsInsertSchema = createInsertSchema(consents, {
  kind: consentKindSchema,
});
export const consentsSelectSchema = createSelectSchema(consents, {
  kind: consentKindSchema,
});
export type ConsentInsert = z.infer<typeof consentsInsertSchema>;
export type ConsentRow = z.infer<typeof consentsSelectSchema>;

// ---- content_sources ----
export const contentSourcesInsertSchema = createInsertSchema(contentSources, {
  kind: contentSourceKindSchema,
  status: contentSourceStatusSchema,
});
export const contentSourcesSelectSchema = createSelectSchema(contentSources, {
  kind: contentSourceKindSchema,
  status: contentSourceStatusSchema,
});
export type ContentSourceInsert = z.infer<typeof contentSourcesInsertSchema>;
export type ContentSourceRow = z.infer<typeof contentSourcesSelectSchema>;

// ---- documents ----
export const documentsInsertSchema = createInsertSchema(documents, {
  kind: documentKindSchema.nullable().optional(),
  rawText: z.string().min(1),
  contentHash: sha256HexSchema,
});
export const documentsSelectSchema = createSelectSchema(documents, {
  kind: documentKindSchema.nullable(),
  contentHash: sha256HexSchema,
});
export type DocumentInsert = z.infer<typeof documentsInsertSchema>;
export type DocumentRow = z.infer<typeof documentsSelectSchema>;

// ---- chunks ----
// Hand-built (not via drizzle-zod): the `vector` column has `dataType: 'array'`
// but no `baseColumn`, so drizzle-zod 0.5.1 crashes when it tries to derive a
// schema for it (the refine option overwrites *after* derivation, too late).
// Mirror the column shape from src/db/schema.ts; tests assert the same set of
// keys as the other tables' auto-derived schemas.
const chunksColumns = {
  id: z.string().uuid(),
  creatorId: z.string().uuid(),
  documentId: z.string().uuid(),
  ordinal: nonNegativeInt,
  text: z.string().min(1),
  embedding: embeddingVectorSchema.nullable(),
  // tsv is populated by the `to_tsvector('portuguese', ...)` trigger; callers never set it.
  tsv: z.string().nullable(),
  topic: z.string().nullable(),
  tokenCount: nonNegativeInt.nullable(),
  createdAt: z.date(),
};

export const chunksSelectSchema = z.object(chunksColumns);

export const chunksInsertSchema = z.object({
  ...chunksColumns,
  // Server-side defaults / trigger-managed: optional on insert.
  id: chunksColumns.id.optional(),
  embedding: chunksColumns.embedding.optional(),
  tsv: chunksColumns.tsv.optional(),
  topic: chunksColumns.topic.optional(),
  tokenCount: chunksColumns.tokenCount.optional(),
  createdAt: chunksColumns.createdAt.optional(),
});
export type ChunkInsert = z.infer<typeof chunksInsertSchema>;
export type ChunkRow = z.infer<typeof chunksSelectSchema>;

// ---- conversations ----
export const conversationsInsertSchema = createInsertSchema(conversations);
export const conversationsSelectSchema = createSelectSchema(conversations);
export type ConversationInsert = z.infer<typeof conversationsInsertSchema>;
export type ConversationRow = z.infer<typeof conversationsSelectSchema>;

// ---- messages ----
export const messagesInsertSchema = createInsertSchema(messages, {
  role: messageRoleSchema,
  content: z.string().min(1),
  retrievedChunks: retrievedChunksSchema.nullable().optional(),
  guardrailFlag: guardrailFlagSchema.nullable().optional(),
  inputTokens: nonNegativeInt.nullable().optional(),
  outputTokens: nonNegativeInt.nullable().optional(),
  latencyMs: nonNegativeInt.nullable().optional(),
});
export const messagesSelectSchema = createSelectSchema(messages, {
  role: messageRoleSchema,
  retrievedChunks: retrievedChunksSchema.nullable(),
  guardrailFlag: guardrailFlagSchema.nullable(),
});
export type MessageInsert = z.infer<typeof messagesInsertSchema>;
export type MessageRow = z.infer<typeof messagesSelectSchema>;

// ---- subscriptions ----
export const subscriptionsInsertSchema = createInsertSchema(subscriptions, {
  plan: subscriptionPlanSchema,
  status: subscriptionStatusSchema,
  provider: subscriptionProviderSchema.nullable().optional(),
});
export const subscriptionsSelectSchema = createSelectSchema(subscriptions, {
  plan: subscriptionPlanSchema,
  status: subscriptionStatusSchema,
  provider: subscriptionProviderSchema.nullable(),
});
export type SubscriptionInsert = z.infer<typeof subscriptionsInsertSchema>;
export type SubscriptionRow = z.infer<typeof subscriptionsSelectSchema>;

// ---- access codes / grants (F1.17) ----
export const accessCodesInsertSchema = createInsertSchema(accessCodes);
export const accessCodesSelectSchema = createSelectSchema(accessCodes);
export type AccessCodeInsert = z.infer<typeof accessCodesInsertSchema>;
export type AccessCodeRow = z.infer<typeof accessCodesSelectSchema>;

export const accessGrantsInsertSchema = createInsertSchema(accessGrants);
export const accessGrantsSelectSchema = createSelectSchema(accessGrants);
export type AccessGrantInsert = z.infer<typeof accessGrantsInsertSchema>;
export type AccessGrantRow = z.infer<typeof accessGrantsSelectSchema>;

// ---- knowledge graph (F1.5) ----
export const kgEntitiesInsertSchema = createInsertSchema(kgEntities);
export const kgEntitiesSelectSchema = createSelectSchema(kgEntities);
export type KgEntityInsert = z.infer<typeof kgEntitiesInsertSchema>;
export type KgEntityRow = z.infer<typeof kgEntitiesSelectSchema>;

export const kgRelationsInsertSchema = createInsertSchema(kgRelations);
export const kgRelationsSelectSchema = createSelectSchema(kgRelations);
export type KgRelationInsert = z.infer<typeof kgRelationsInsertSchema>;
export type KgRelationRow = z.infer<typeof kgRelationsSelectSchema>;

// ============================================================================
// Catalog — single source of truth for "every table has insert+select schemas".
// Tests iterate over this so new tables fail loudly if their schemas are missing.
// ============================================================================
export const tableSchemas = {
  creators: { insert: creatorsInsertSchema, select: creatorsSelectSchema },
  users: { insert: usersInsertSchema, select: usersSelectSchema },
  consents: { insert: consentsInsertSchema, select: consentsSelectSchema },
  contentSources: {
    insert: contentSourcesInsertSchema,
    select: contentSourcesSelectSchema,
  },
  documents: { insert: documentsInsertSchema, select: documentsSelectSchema },
  chunks: { insert: chunksInsertSchema, select: chunksSelectSchema },
  conversations: {
    insert: conversationsInsertSchema,
    select: conversationsSelectSchema,
  },
  messages: { insert: messagesInsertSchema, select: messagesSelectSchema },
  subscriptions: {
    insert: subscriptionsInsertSchema,
    select: subscriptionsSelectSchema,
  },
  accessCodes: { insert: accessCodesInsertSchema, select: accessCodesSelectSchema },
  accessGrants: { insert: accessGrantsInsertSchema, select: accessGrantsSelectSchema },
  kgEntities: { insert: kgEntitiesInsertSchema, select: kgEntitiesSelectSchema },
  kgRelations: { insert: kgRelationsInsertSchema, select: kgRelationsSelectSchema },
} as const;

export type TableName = keyof typeof tableSchemas;
