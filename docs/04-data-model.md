# 04 — Modelo de dados (PostgreSQL + pgvector no Supabase)

> Todas as tabelas de conteúdo e conversa têm `creator_id` (multi-tenant desde o dia 1). Use UUIDs. Habilite `CREATE EXTENSION vector;`.
>
> **Hospedagem:** o schema roda no Supabase (Postgres 16 + pgvector). Em dev local, `supabase start` provisiona um Postgres idêntico ao de produção. As migrations são geradas com **Drizzle Kit** e aplicadas via `DATABASE_URL_DIRECT` (conexão direta, não pelo pooler — o transaction pooler quebra DDL).
>
> **Auth:** o Supabase mantém seu próprio schema `auth` com a tabela `auth.users`. Nossa tabela `users` (abaixo) é uma projeção da aplicação: `users.external_id` referencia `auth.users.id`. Trigger no Supabase replica novo signup para `public.users`.
>
> **Storage:** uploads brutos (áudio/vídeo/PDF) ficam em **Supabase Storage**, com bucket por `creator_id` (path `creator/{creator_id}/raw/{document_id}.{ext}`). A tabela `documents` guarda apenas a URL/path e o texto normalizado.

## Schema (DDL de referência)

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Criadores (tenants)
CREATE TABLE creators (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT UNIQUE NOT NULL,           -- ex.: 'fausto'
  display_name  TEXT NOT NULL,
  niche         TEXT,
  persona_card  JSONB,                          -- ver doc 05
  voice_id      TEXT,                           -- id da voz no provedor (Fase 1)
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Usuários finais (assinantes) e o próprio criador
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id   TEXT UNIQUE,                    -- id do Clerk
  email         TEXT,
  role          TEXT NOT NULL DEFAULT 'subscriber', -- subscriber|creator|operator
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Consentimentos (conteúdo, voz, imagem)
CREATE TABLE consents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id    UUID NOT NULL REFERENCES creators(id),
  kind          TEXT NOT NULL,                  -- content|voice|likeness
  granted       BOOLEAN NOT NULL DEFAULT false,
  document_url  TEXT,                           -- contrato assinado
  granted_at    TIMESTAMPTZ
);

-- Fontes de conteúdo conectadas
CREATE TABLE content_sources (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id    UUID NOT NULL REFERENCES creators(id),
  kind          TEXT NOT NULL,                  -- instagram|youtube|upload|text
  external_ref  TEXT,                           -- handle/canal
  status        TEXT NOT NULL DEFAULT 'pending',-- pending|indexing|indexed|error
  last_synced_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Documentos (um post/vídeo/artigo normalizado)
CREATE TABLE documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id    UUID NOT NULL REFERENCES creators(id),
  source_id     UUID REFERENCES content_sources(id),
  title         TEXT,
  url           TEXT,
  kind          TEXT,                           -- reel|video|caption|article|transcript
  raw_text      TEXT NOT NULL,
  content_hash  TEXT NOT NULL,                  -- idempotência
  published_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (creator_id, content_hash)
);

-- Chunks + embeddings (the second brain)
CREATE TABLE chunks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id    UUID NOT NULL REFERENCES creators(id),
  document_id   UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  ordinal       INT NOT NULL,
  text          TEXT NOT NULL,
  embedding     vector(1536),                   -- text-embedding-3-small
  tsv           tsvector,                       -- busca BM25/keyword (portuguese)
  topic         TEXT,                           -- cluster/tema (para mind viz)
  token_count   INT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ON chunks USING gin (tsv);
CREATE INDEX ON chunks (creator_id);

-- Conversas e mensagens
CREATE TABLE conversations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id    UUID NOT NULL REFERENCES creators(id),
  user_id       UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  creator_id      UUID NOT NULL REFERENCES creators(id),
  role            TEXT NOT NULL,                -- user|assistant
  content         TEXT NOT NULL,
  retrieved_chunks JSONB,                       -- ids + scores das fontes citadas
  guardrail_flag  TEXT,                         -- none|investment|safety
  model           TEXT,
  input_tokens    INT,
  output_tokens   INT,
  cost_usd        NUMERIC(10,5),
  latency_ms      INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Assinaturas (acesso ao clone)
CREATE TABLE subscriptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id    UUID NOT NULL REFERENCES creators(id),
  user_id       UUID NOT NULL REFERENCES users(id),
  plan          TEXT NOT NULL,                  -- basic|pro
  status        TEXT NOT NULL,                  -- active|canceled|past_due
  provider      TEXT,                           -- stripe|hotmart|kiwify
  external_id   TEXT,
  current_period_end TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## Extensão: knowledge graph (Fase 1.5+ — ver doc 10)
Não criar no MVP. Quando adicionar a camada de grafo:

```sql
-- adicionar peso de confiança aos chunks
ALTER TABLE chunks ADD COLUMN confidence REAL DEFAULT 1.0;

CREATE TABLE kg_entities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id  UUID NOT NULL REFERENCES creators(id),
  name        TEXT NOT NULL,
  kind        TEXT,                -- pessoa|tema|principio|evento|heuristica
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE kg_relations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id  UUID NOT NULL REFERENCES creators(id),
  src_id      UUID NOT NULL REFERENCES kg_entities(id),
  dst_id      UUID NOT NULL REFERENCES kg_entities(id),
  relation    TEXT NOT NULL,       -- ex.: "acredita_que", "decide_por", "relaciona"
  confidence  REAL DEFAULT 0.7,    -- prob. de que o criador realmente diria isso
  valid_from  TIMESTAMPTZ,         -- dimensão temporal
  valid_to    TIMESTAMPTZ,
  source_chunk UUID REFERENCES chunks(id)
);
```
- `messages.guardrail_flag` ganha o nível de leniência usado na extrapolação (auditoria).
- Migrar para Neo4j só se a complexidade do grafo exigir; começar no Postgres.

## Notas
- `content_hash` garante idempotência: reprocessar a mesma fonte não duplica `documents`.
- `tsv` deve ser populado com `to_tsvector('portuguese', text)`.
- Índice HNSW para busca vetorial; GIN para busca textual; juntos = busca híbrida (ver doc 05).
- `messages` é a fonte de verdade para custo e avaliação — preencher sempre.
- Acesso ao clone = existir `subscription` ativa OU o usuário ser o criador/operador.

## RLS (Row-Level Security) no Supabase
- **MVP (Fase 0):** RLS **desativada** nas tabelas de aplicação. Todos os acessos passam pelo backend Hono usando a `SUPABASE_SERVICE_ROLE_KEY`; a autorização por `creator_id` é feita na camada `services/`. Manter RLS off no MVP reduz fricção (sem políticas para escrever, sem pegadinhas em jobs do worker).
- **Fase 2 (multi-tenant self-service):** ligar RLS como defesa em profundidade. Política base: `creator_id = current_setting('app.creator_id')::uuid`. O backend seta `SET LOCAL app.creator_id` no início de cada transação. Habilitar uma tabela por vez, com testes.

## Mapeamento Drizzle (TypeScript)
- Schema em `backend/src/db/schema.ts` espelha o DDL acima. Coluna `embedding` declarada como `vector('embedding', { dimensions: 1536 })` (Drizzle suporta `pgvector` nativo).
- `chunks.tsv` fica como coluna gerada / atualizada por trigger; queries de busca textual usam `sql\`to_tsvector('portuguese', ${text})\``.
- Para a busca híbrida (vetorial + BM25 + RRF) preferir **SQL puro via `db.execute(sql\`...\`)`** — o RRF é uma CTE única, não tenta forçar pelo query builder.
- Migrations geradas com `drizzle-kit generate` e versionadas em `infra/supabase/migrations/`. Aplicadas com `drizzle-kit migrate` usando `DATABASE_URL_DIRECT`.
