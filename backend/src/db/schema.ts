import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from 'drizzle-orm/pg-core';

// pgvector embedding type — 1536-d (text-embedding-3-small).
// Drizzle ships native `vector` support; we wrap it for clarity.

// Postgres tsvector — não há tipo nativo no Drizzle ainda. Modelamos via customType.
// A coluna em si é populada por trigger (ver migration `0001_tsv_and_storage.sql`).
const tsvector = customType<{ data: string; driverData: string }>({
  dataType: () => 'tsvector',
});

// =============================================================================
// creators (tenants)
// =============================================================================
export const creators = pgTable('creators', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug').notNull().unique(),
  displayName: text('display_name').notNull(),
  niche: text('niche'),
  // Dono do clone (self-signup, F1.x). Nulo p/ criadores legados (ex.: seed do
  // fausto). Forward-ref a `users` (definida abaixo) via thunk do Drizzle.
  ownerUserId: uuid('owner_user_id').references(() => users.id),
  // Persona Card (ver docs/05-rag-and-guardrails.md §Persona Card).
  personaCard: jsonb('persona_card'),
  voiceId: text('voice_id'),
  // Leniency (F1.5.4): how far the clone may extrapolate beyond explicit
  // content — 'strict' (nunca) | 'balanced' (default) | 'open' (mais livre).
  leniency: text('leniency').notNull().default('balanced'),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// =============================================================================
// users (assinantes + criador + operador)
// `external_id` referencia auth.users.id do Supabase Auth.
// =============================================================================
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  externalId: text('external_id').unique(),
  email: text('email'),
  role: text('role').notNull().default('subscriber'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// =============================================================================
// consents (conteúdo, voz, imagem)
// =============================================================================
export const consents = pgTable('consents', {
  id: uuid('id').defaultRandom().primaryKey(),
  creatorId: uuid('creator_id')
    .notNull()
    .references(() => creators.id),
  kind: text('kind').notNull(),
  granted: boolean('granted').notNull().default(false),
  documentUrl: text('document_url'),
  grantedAt: timestamp('granted_at', { withTimezone: true }),
});

// =============================================================================
// content_sources (fontes conectadas)
// =============================================================================
export const contentSources = pgTable('content_sources', {
  id: uuid('id').defaultRandom().primaryKey(),
  creatorId: uuid('creator_id')
    .notNull()
    .references(() => creators.id),
  kind: text('kind').notNull(),
  externalRef: text('external_ref'),
  status: text('status').notNull().default('pending'),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// =============================================================================
// documents (um post/vídeo/artigo normalizado)
// =============================================================================
export const documents = pgTable(
  'documents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creators.id),
    sourceId: uuid('source_id').references(() => contentSources.id),
    title: text('title'),
    url: text('url'),
    kind: text('kind'),
    rawText: text('raw_text').notNull(),
    contentHash: text('content_hash').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    creatorContentHashIdx: uniqueIndex('documents_creator_content_hash_idx').on(
      t.creatorId,
      t.contentHash,
    ),
  }),
);

// =============================================================================
// chunks (the second brain) — embeddings + tsv + topic
// =============================================================================
export const chunks = pgTable(
  'chunks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creators.id),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(),
    text: text('text').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    tsv: tsvector('tsv'),
    topic: text('topic'),
    tokenCount: integer('token_count'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    creatorIdx: index('chunks_creator_idx').on(t.creatorId),
    // HNSW índice para busca vetorial (cosine).
    embeddingHnswIdx: index('chunks_embedding_hnsw_idx')
      .using('hnsw', t.embedding.op('vector_cosine_ops'))
      .with({ m: 16, ef_construction: 64 }),
    // GIN índice para busca textual (BM25-like via ts_rank).
    tsvGinIdx: index('chunks_tsv_gin_idx').using('gin', t.tsv),
  }),
);

// =============================================================================
// conversations + messages
// =============================================================================
export const conversations = pgTable('conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  creatorId: uuid('creator_id')
    .notNull()
    .references(() => creators.id),
  userId: uuid('user_id').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const messages = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  creatorId: uuid('creator_id')
    .notNull()
    .references(() => creators.id),
  role: text('role').notNull(),
  content: text('content').notNull(),
  // ids + scores dos chunks usados na resposta (auditoria + fontes).
  retrievedChunks: jsonb('retrieved_chunks'),
  // none|investment|safety (ver docs/05 §Guardrails).
  guardrailFlag: text('guardrail_flag'),
  // Leniência aplicada nesta resposta (F1.5.4, auditoria): strict|balanced|open.
  leniency: text('leniency'),
  model: text('model'),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  costUsd: numeric('cost_usd', { precision: 10, scale: 5 }),
  latencyMs: integer('latency_ms'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// =============================================================================
// subscriptions (acesso ao clone via paywall)
// =============================================================================
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creators.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    plan: text('plan').notNull(),
    status: text('status').notNull(),
    provider: text('provider'),
    externalId: text('external_id'),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Idempotency key for the billing webhook (E5.3): a provider event for the
    // same subscription upserts this row instead of inserting a duplicate.
    // NULL external_ids (e.g. seed/test rows) stay distinct under SQL UNIQUE.
    providerExternalIdUq: uniqueIndex('subscriptions_provider_external_id_uq').on(
      t.provider,
      t.externalId,
    ),
  }),
);

// Access codes (F1.17): a creator hands out codes so people can talk to the
// clone without going through Stripe (pilots, beta, gifted access). Redeeming a
// valid code creates an `access_grants` row that the paywall honors.
export const accessCodes = pgTable(
  'access_codes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creators.id),
    /** Shareable code string (stored uppercase, globally unique). */
    code: text('code').notNull(),
    /** Optional human label, e.g. "Lançamento Instagram". */
    label: text('label'),
    /** Max times this code can be redeemed; NULL = unlimited. */
    maxRedemptions: integer('max_redemptions'),
    redemptionCount: integer('redemption_count').notNull().default(0),
    active: boolean('active').notNull().default(true),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    codeUq: uniqueIndex('access_codes_code_uq').on(t.code),
  }),
);

// One row per (user, creator) once a user redeems a valid code — the grant the
// paywall checks alongside subscriptions.
export const accessGrants = pgTable(
  'access_grants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creators.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    /** Which code unlocked this grant (NULL if granted another way later). */
    codeId: uuid('code_id').references(() => accessCodes.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userCreatorUq: uniqueIndex('access_grants_user_creator_uq').on(t.userId, t.creatorId),
  }),
);

// Knowledge graph (F1.5, doc 10): entities + relations extracted from the
// creator's content. Captures HOW they reason (principles/heuristics), not just
// what they said. Confidence = "how likely is it the creator would actually say
// this". Stays in Postgres for now (doc 04 §extensão); Neo4j only if needed.
export const kgEntities = pgTable(
  'kg_entities',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creators.id),
    name: text('name').notNull(),
    /** pessoa | tema | principio | evento | heuristica. */
    kind: text('kind'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Dedupe entities per creator so re-extraction is idempotent.
    creatorNameKindUq: uniqueIndex('kg_entities_creator_name_kind_uq').on(
      t.creatorId,
      t.name,
      t.kind,
    ),
  }),
);

export const kgRelations = pgTable(
  'kg_relations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creators.id),
    srcId: uuid('src_id')
      .notNull()
      .references(() => kgEntities.id),
    dstId: uuid('dst_id')
      .notNull()
      .references(() => kgEntities.id),
    /** ex.: "acredita_que", "decide_por", "relaciona". */
    relation: text('relation').notNull(),
    /** Probability the creator would really say/hold this, in [0,1]. */
    confidence: real('confidence').notNull().default(0.7),
    /** Temporal dimension (F1.5.5) — when this held true. */
    validFrom: timestamp('valid_from', { withTimezone: true }),
    validTo: timestamp('valid_to', { withTimezone: true }),
    /** The chunk this relation was extracted from (provenance). */
    sourceChunk: uuid('source_chunk').references(() => chunks.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Dedupe identical triples from the same chunk on re-extraction.
    tripleUq: uniqueIndex('kg_relations_triple_uq').on(t.srcId, t.dstId, t.relation, t.sourceChunk),
  }),
);

// Content ideas (Insights): pautas sugeridas pela IA a partir da demanda da
// audiência. Persistidas para o criador revisitar; `script` é o roteiro gerado
// sob demanda ao abrir a pauta.
export const contentIdeas = pgTable(
  'content_ideas',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => creators.id),
    title: text('title').notNull(),
    angle: text('angle').notNull(),
    /** demanda | lacuna — por que foi sugerida. */
    basedOn: text('based_on'),
    /** A pergunta da audiência que motivou a pauta (o "porquê"). */
    sourceQuestion: text('source_question'),
    /** Roteiro completo, gerado sob demanda ao abrir a pauta (markdown). */
    script: text('script'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    creatorTitleUq: uniqueIndex('content_ideas_creator_title_uq').on(t.creatorId, t.title),
  }),
);

// =============================================================================
// Typed re-exports — facilitam imports.
// =============================================================================
export const schema = {
  creators,
  users,
  consents,
  contentSources,
  documents,
  chunks,
  conversations,
  messages,
  subscriptions,
  accessCodes,
  accessGrants,
  kgEntities,
  kgRelations,
  contentIdeas,
};

export type Schema = typeof schema;

// Helper para garantir que toda query passa um creatorId — usar em services/.
export const REQUIRE_CREATOR_ID = sql`-- creator_id is mandatory in every query (CLAUDE.md)`;
