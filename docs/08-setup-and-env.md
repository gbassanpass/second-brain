# 08 — Setup e variáveis de ambiente

## Pré-requisitos
- **Node 20+** e **pnpm 9+** (`npm i -g pnpm`).
- **Docker + Docker Compose** (usados pelo Supabase CLI e pelo Redis local).
- **Supabase CLI** (`brew install supabase/tap/supabase` ou `npm i -g supabase`).
- Contas/keys: Anthropic, OpenAI, Cohere, Deepgram (ou AssemblyAI), Stripe. (ElevenLabs e Phyllo na Fase 1.)
- O Supabase Auth vem no `supabase start` — não há cadastro externo no MVP.

## `.env.example` (copiar para `.env`, nunca commitar `.env`)
```
# Core
APP_ENV=dev
APP_PORT=3001
APP_SECRET=change-me                 # usado para assinaturas internas (cookies, jobs)

# Supabase (preenchidos automaticamente após `supabase start`)
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
# Postgres do Supabase: duas URLs
# - runtime (queries da API/worker) via pooler
# - direta para migrations (Drizzle Kit) — o transaction pooler quebra DDL
DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres
DATABASE_URL_DIRECT=postgresql://postgres:postgres@localhost:54322/postgres

# Redis (BullMQ)
REDIS_URL=redis://localhost:6379/0

# LLM / IA
ANTHROPIC_API_KEY=
LLM_PROVIDER=anthropic
LLM_DEFAULT_MODEL=claude-haiku
LLM_FALLBACK_MODEL=claude-sonnet
OPENAI_API_KEY=
EMBEDDINGS_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-3-small
COHERE_API_KEY=
RERANK_PROVIDER=cohere
RERANK_MODEL=rerank-3.5

# Transcrição
TRANSCRIPTION_PROVIDER=deepgram
DEEPGRAM_API_KEY=
# ou ASSEMBLYAI_API_KEY=

# Conectores (Fase 1)
PHYLLO_CLIENT_ID=
PHYLLO_CLIENT_SECRET=
PHYLLO_ENV=sandbox

# Voz (Fase 1)
ELEVENLABS_API_KEY=

# Billing
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Limites/custo
MAX_TOKENS_PER_REPLY=800
RETRIEVAL_TOP_K=5
RERANK_SCORE_THRESHOLD=0.2
```

> Valores de `SUPABASE_URL` / chaves locais são impressos pelo `supabase start` ao subir. Em produção, vêm do dashboard do projeto Supabase.

## Infra local
- **Supabase CLI** sobe Postgres 16 (com pgvector já habilitado), Storage, Auth, Studio e API REST. Config em `infra/supabase/config.toml`.
- **Redis** sobe via `infra/docker-compose.yml` (apenas Redis — Postgres vem do Supabase).
- Backend Hono e workers BullMQ rodam fora do Docker em dev (`pnpm dev` em watch).
- Frontend Next.js roda em watch (`pnpm --filter frontend dev`).

## Comandos (Makefile alvo — wrappers sobre pnpm/supabase)
```
make up              # supabase start + docker-compose up redis
make down            # supabase stop + docker-compose down
make migrate         # drizzle-kit migrate (usa DATABASE_URL_DIRECT)
make migrate-gen     # drizzle-kit generate (a partir do schema.ts)
make seed            # cria o creator 'fausto' + Persona Card inicial + buckets de storage
make dev             # pnpm dev em paralelo: backend + worker + frontend
make test            # vitest run (backend + frontend) + harness do RAG
make lint            # biome check
make format          # biome format --write
make eval            # roda o harness de avaliação do RAG (eval/golden.yaml)
make ingest-fausto   # ManualUploadConnector lê data/fausto/ e ingere
```

## Bootstrap do Fausto (MVP)
1. `cp .env.example .env` e preencha as chaves de provedor (Anthropic, OpenAI, Cohere, Deepgram).
2. `make up` (sobe Supabase CLI + Redis). Copie as chaves impressas pelo `supabase start` para o `.env`.
3. `make migrate && make seed`.
4. Coloque transcrições/legendas/textos do Fausto em `data/fausto/` (estrutura sugerida: `data/fausto/{posts,transcripts,articles}/*.{md,txt}`).
5. `make ingest-fausto` → conferir `chunks` populados (`select count(*) from chunks where creator_id = ...`).
6. `make dev` → abrir o chat (`http://localhost:3000/c/fausto/chat`), validar com as golden questions.

## Segurança operacional
- Nunca logar segredos. Nunca colocar dados pessoais em querystring.
- `SUPABASE_SERVICE_ROLE_KEY` só roda no backend/worker (nunca no frontend). O frontend usa `SUPABASE_ANON_KEY`.
- Webhooks de billing: validar assinatura do provedor (Stripe `stripe-signature`; Hotmart/Kiwify por HMAC).
- Backups: o Supabase Pro tem PITR; até lá, dumps periódicos via `supabase db dump`.
- Migrations só com `DATABASE_URL_DIRECT` — o transaction pooler do Supabase quebra DDL e prepared statements de longa duração.
