# PROGRESS — Estado atual do projeto

> **Para o Claude (e para você ao retomar):** este arquivo é a fonte da verdade do progresso. Atualize-o **toda vez** que uma tarefa do backlog for marcada como concluída. Cada commit que fecha tarefa deve mexer aqui também.
>
> A fonte completa de tarefas (com aceite) está em [`docs/07-roadmap-backlog.md`](docs/07-roadmap-backlog.md). Este arquivo é só o snapshot rápido.

## Onde estamos

- **Fase:** 0 — MVP single-tenant para o Fausto.
- **Épico atual:** **E4 — Avaliação** ✅ 2/2 tarefas — épico fechado, aguarda revisão humana.
- **Próxima tarefa:** **E5.1** — Supabase Auth + trigger `on_auth_user_created` + middleware Hono que valida JWT.
- **Último commit:** `b61b017 E4.2: harness make eval + CI gate por passRate`.

> 🟢 **End-to-end RAG real funcionando**: `curl POST /api/chat {creatorSlug:"fausto", query:"O que ele pensa sobre as eleições de 2026?"}` em ~7s retorna resposta no estilo Fausto citando [1] com os dados do conteúdo indexado (3.5M óbitos, 2M novos eleitores, 80% probabilidade). Tudo persistido em `messages`: model `claude-haiku-4-5-20251001`, 917 in / 425 out tokens, **$0.00076** por turno, latência 4.5s, retrievedChunks com chunkId+score+rank.

> ✅ **Conteúdo do Fausto indexado**: 5 transcripts → 10 chunks com embeddings OpenAI reais (`text-embedding-3-small`, 1536-d). Smoke `retrieval-smoke fausto "Bolsonaro"` retorna ordem semanticamente sã com legs vetorial + textual fundidas via RRF.
- **Branch:** `main` sincronizada com `origin/main` (https://github.com/gbassanpass/second-brain).
- **Working tree:** limpo. **`.env`** local já tem as chaves do Supabase preenchidas (gitignored).

## Marco do E0.2 (referência rápida)

Tudo da infra de DB está em pé e testado:
- Supabase local rodando (`make up`) — API `:54321`, DB `:54322`, Studio `:54323`, Inbucket/Mailpit `:54324`.
- Postgres 17 com `vector 0.8.2` + `pg_trgm 1.6`.
- 9 tabelas espelhando `docs/04`. `chunks.embedding = vector(1536)`, HNSW (m=16, ef=64), GIN sobre `tsv`, trigger `chunks_tsv_trigger` populando `tsv` com `to_tsvector('portuguese', ...)`.
- Bucket `creator-content` no Storage (private, 500 MiB, MIME texto/áudio/vídeo).
- Migrations: `0000_curly_the_initiative.sql` (gerada Drizzle + extensions no topo) e `0001_tsv_and_storage.sql` (trigger + bucket).
- Containers extras de outro projeto (`agent-infra-docker-*`) seguem em pé sem conflito.

## Marco do E0.4 (referência rápida)

Camada de provedores pronta (toda em TS, sem SDK de terceiro):
- **LLM** (`backend/src/llm/`): `LLMClient` + `AnthropicLLM` (fetch → `/v1/messages`, com prompt-caching via `cache_control`) + `FakeLLM` (eco do último user, tokens estimados por caracteres).
- **Embeddings** (`backend/src/embeddings/`): `Embedder` + `OpenAIEmbedder` + `FakeEmbedder` (sha256 → vetor 1536 unit-normed, determinístico).
- **Rerank** (`backend/src/rerank/`): `Reranker` + `CohereReranker` (`/v2/rerank`) + `FakeReranker` (Jaccard sobre tokens, estável em empate).
- **Transcrição** (`backend/src/transcription/`): `Transcriber` + `DeepgramTranscriber` (Nova-3, paragraphs + diarize) + `FakeTranscriber` (hash do buffer / eco da URL).
- **Connector** (`backend/src/connectors/`): `ContentConnector` + `ManualUploadConnector` (lê `data/fausto/`, mapeia subdir → kind, parser SRT/VTT, envelope JSON validado por Zod, hash sha256 do path relativo como `externalId`) + `FakeConnector` para fixtures.
- **Factories** por env (`config.LLM_PROVIDER` etc): trocar provedor é trocar 1 env.
- **Biome `noRestrictedImports`** bloqueia SDKs (`@anthropic-ai/sdk`, `openai`, `cohere-ai`, `@deepgram/sdk`, `assemblyai`, `elevenlabs`, `stripe`) fora dos diretórios de adapter (`llm/`, `embeddings/`, `rerank/`, `transcription/`, `voice/`, `billing/`).
- Testes: 51 (config 7 + llm 8 + embeddings 9 + rerank 7 + transcription 9 + connectors 8 + health 2 + frontend smoke 1).

## ▶️ Roteiro de retomada padrão

1. `docker info --format '{{.ServerVersion}}'` — confirma Docker rodando.
2. `make up` — Supabase local + Redis. Se for primeira vez na sessão, supabase imprime as chaves no terminal; já estão salvas no `.env`.
3. `make migrate` — idempotente; pode rodar sempre.
4. Trabalhe a próxima tarefa, atualize `PROGRESS.md` + checkbox no `docs/07-roadmap-backlog.md`, commit + push.

## Checklist da Fase 0

### E0 — Scaffolding & infra
- [x] **E0.1** Monorepo pnpm (backend Hono + frontend Next.js + Biome + Vitest + Makefile + healthcheck).
- [x] **E0.2** Supabase CLI + Drizzle schema (tabelas/índices do doc 04) + bucket de Storage.
- [x] **E0.3** Config tipada com Zod (`backend/src/config.ts`) + falha clara se faltar env.
- [x] **E0.4** Adapters (llm/embeddings/rerank/transcription + connectors `ManualUpload`) com fakes para testes.

### E1 — Ingestão & second brain
- [x] **E1.1** Schema Drizzle + tipos Zod (`backend/src/db/types.ts` via `drizzle-zod`, enums de domínio, schema do `retrieved_chunks`).
- [x] **E1.2** `POST /api/creators/:slug/documents` + `make ingest-fausto` (sha256 do raw_text; UNIQUE creator_id+content_hash garante idempotência).
- [x] **E1.3** Chunker (~400 tokens, overlap ~15%, fallback word-window) + `indexDocument` (Embedder injetado, delete+insert idempotente, tsv via trigger) + smoke `EXPLAIN ANALYZE` mostrando `Index Scan using chunks_embedding_hnsw_idx`.
- [x] **E1.4** Worker BullMQ (`backend/src/workers/ingest.ts`) + `POST /api/sources/:id/sync` + `syncContentSource` (pending → indexing → indexed, idempotente).

> Em test, embeddings fake são default. Em dev, exige `OPENAI_API_KEY` com acesso a `text-embedding-3-small` no projeto OpenAI. Para `make worker` o Redis precisa estar de pé (`make up`).
- [x] **E1.4** Worker BullMQ + `POST /api/sources/:id/sync`
- [ ] E1.5 (opcional MVP) Transcrição

### E2 — Núcleo RAG
- [x] **E2.1** Busca híbrida (vetorial + tsvector + RRF) — `backend/src/rag/retrieval.ts::hybridSearch`
- [x] **E2.2** Rerank top-50 → top-N + threshold + fallback `"no_context"` — `retrieveAndRerank` em `retrieval.ts`
- [x] **E2.3** Persona Card — schema Zod (`rag/persona.ts`), service `getPersonaCard`/`setPersonaCard`, rotas `GET|PUT /api/creators/:slug/persona`, seed do Fausto via `make seed` (idempotente; `SEED_FORCE_PERSONA=1` sobrescreve).
- [x] **E2.4** Prompt builders — `buildSystemPrompt(card)` estável (cacheável), `buildUserPrompt({query, chunks})` numerado, `buildLLMArgs` com `cacheSystemPrompt: true`. Smoke real com Haiku 4.5 retorna resposta citando [1]. ⚠️ Persona atual (~500 tokens) está abaixo do mínimo de cache do Anthropic (Haiku 2048; Sonnet 1024) — wiring correto mas cache só ativa quando persona/few-shots crescerem.
- [x] **E2.5** Orquestrador `POST /api/chat` — `services/chat.ts::processChat` faz query → embed → retrieveAndRerank → (LLM | fallback `no_context`) → persiste user+assistant em `messages` com model/tokens/costUsd/latencyMs/retrievedChunks. `rag/cost.ts` aplica pricing Anthropic com modificadores de cache (10% read, 125% write).
- [x] **E2.6** Roteamento Haiku ↔ Sonnet — `rag/routing.ts::pickModel` aplica heurísticas (`long_query` > 280 chars, `multi_question` > 1 `?`, `low_retrieval_confidence` top score < 0.3, ou `forced_*` via env `LLM_ROUTING_FORCE`). Loga cada decisão com signals; `routingReason` no response e em `messages.model`.
- [ ] E2.2 Rerank Cohere
- [ ] E2.3 Persona Card (modelo + seed Fausto + endpoint)
- [ ] E2.4 Prompt + caching
- [ ] E2.5 Orquestrador `POST /api/chat`
- [ ] E2.6 Roteamento Haiku/Sonnet

### E3 — Guardrails (BLOQUEANTE)
- [x] **E3.1** Classificador anti-investimento — `rag/guardrails.ts::detectInvestmentIntent` com 8 action patterns + 7 financial-term groups; high/medium/low confidence; `messages.guardrail_flag='investment'` persistido no DB.
- [x] **E3.2** Modo educacional forçado — `prompt.ts::EDUCATIONAL_MODE_PREAMBLE` prependido no user msg quando `guardrail.flag='investment'` (preserva cache do system); Claude real responde recusando recomendação, explicando cenário, listando perguntas-chave e fechando com o disclaimer.
- [x] **E3.3** Filtro pós-geração — `rag/guardrails.ts::detectDirectRecommendation` cobre 4 padrões (imperativo+ativo, imperativo+%, "recomendo X comprar Y", "você deve+verbo financeiro"). No `runAssistantTurn`: se a 1ª resposta viola, regenera 1x com `REINFORCED_RETRY_PREAMBLE` (system+history byte-identical → cache mantém); se 2ª também viola, devolve `buildSafeEducationalReply(personaName)` canned. Usage/cost/latency somados nas 2 chamadas; defense-in-depth: post-filter sobe `messages.guardrail_flag='investment'` mesmo se o pre-classifier deixou passar. API expõe `postFilter:{action:'pass'|'regenerated'|'replaced', category, signals}`.
- [x] **E3.4** Anti-alucinação + tom neutro — `buildSystemPrompt` ganha linha fixa "Mantenha tom neutro e factual; não tome lado partidário ou militante.". `rag/guardrails.ts::detectMissingCitations` flagra resposta ≥200 chars sem `[N]` quando há chunks. Em turnos não-`investment`, `runAssistantTurn` roda 2º pass: se falta citação, regenera com `CITATION_RETRY_PREAMBLE`; se ainda falta, substitui pela canned "Não tenho isso registrado nos conteúdos de {name}" (idêntica à do no_context, com `fontes:[]`). `PostFilterDecision.category` distingue `recommendation` vs `missing_citation` — só o primeiro escala pra `guardrail_flag='investment'`.

### E4 — Avaliação
- [x] **E4.1** `eval/golden.yaml` — 31 perguntas (12 geopolítica c/ fatos-âncora dos transcripts, 5 fé→no_context, 5 decisão de vida→no_context, 7 investimento→guardrail bloqueante, 2 safety→no_context). Schema Zod (`eval/schema.ts`) + loader (`eval/loader.ts` com `yaml`) + teste (`tests/eval-golden.test.ts`) garantindo ID kebab-case único, cobertura mínima por categoria, `guardrail_flag=investment` + must_not_contain "compre/venda/aloque" em todas de investimento, `fallback=no_context` + "não tenho isso registrado" em fé/decisão.
- [x] **E4.2** Harness `make eval` + CI gate — `eval/assertions.ts::evaluate` checa 6 dimensões (guardrail_flag, fallback, post_filter_category, must_contain_any, must_not_contain, requires_citation). `eval/runner.ts::runEval` puro orquestra question→chatRunner→evaluate→summarize. `eval/reporter.ts` agrega por categoria + custo total/médio + latência média e gera relatório texto + JSON. CLI em `backend/src/scripts/eval.ts` wirea services reais (createEmbedder/Reranker/LLMClient), conecta no DB, roda contra `processChat`, salva em `eval/reports/latest.json`, exit 1 se `passRate < EVAL_PASS_THRESHOLD` (default 0.8). `make eval` chama `pnpm --filter @second-brain/backend eval`. 18 testes novos (assertions + runEval com fake chatRunner).

### E5 — Auth, paywall, billing (pendente)
- [ ] E5.1 Supabase Auth + trigger `on_auth_user_created`
- [ ] E5.2 Middleware `requireAccess`
- [ ] E5.3 Webhook idempotente de billing

### E6 — Frontend MVP (pendente)
- [ ] E6.1 Landing `/c/[slug]`
- [ ] E6.2 Chat `/c/[slug]/chat` (estilo ChatGPT — doc 11)
- [ ] E6.3 Paywall/checkout
- [ ] E6.4 Studio `/studio`
- [ ] E6.5 Analytics cards

## Decisões consolidadas (não revisitar sem motivo forte)

- **Backend:** Node 20 + TypeScript + **Hono** + **Drizzle ORM** + **Zod** + **BullMQ**.
- **DB + Auth + Storage:** **Supabase** (Postgres 17 + pgvector + Auth + Storage). Dev local via `supabase start`.
- **Frontend:** Next.js 14 (App Router) + Tailwind. Tema dark estilo ChatGPT (doc 11).
- **Lint/format:** Biome (substitui ESLint + Prettier).
- **Testes:** Vitest no backend e frontend.
- **Connectors:** interface `ContentConnector`; `ManualUploadConnector` no MVP, `PhylloConnector` apenas na F1.1.
- **Identidade git deste repo:** `Bassan / gumaba1@gmail.com`; conta GitHub `gbassanpass`. **NÃO** usar `tools@bossabox.com` aqui.

## Como rodar localmente

### Pré-requisitos (uma vez)
```bash
# Node 20+ e pnpm já instalados — confirme
node --version    # >= 20
pnpm --version    # >= 9

# Supabase CLI (necessário a partir do E0.2)
brew install supabase/tap/supabase

# Docker Desktop rodando (Redis local + Supabase CLI usam por baixo)
```

### Setup (uma vez, se `.env` não existir)
```bash
pnpm install                  # instala deps de todos os workspaces
cp .env.example .env          # preencha SUPABASE_*/DATABASE_URL com `supabase status`
```
> Hoje o `.env` já existe com as credenciais do Supabase local. Chaves de provedor (Anthropic, OpenAI, Cohere, Deepgram) só precisam ser preenchidas a partir do E2.

### Dia a dia
```bash
# Infra local
make up                       # Supabase (API:54321 / DB:54322 / Studio:54323) + Redis
make migrate                  # drizzle-kit migrate (idempotente)
make down                     # parar tudo

# Dev (em watch)
make dev                                            # backend + frontend juntos
pnpm --filter @second-brain/backend dev             # só backend :3001
pnpm --filter @second-brain/frontend dev            # só frontend :3000

# Qualidade
pnpm lint                     # Biome
pnpm test                     # Vitest
pnpm typecheck                # tsc --noEmit nos 2 workspaces

# Sanity
curl http://localhost:3001/api/health
docker exec -i supabase_db_supabase psql -U postgres -d postgres -c "\dt public.*"
```

### Comandos previstos (próximos épicos)
```bash
make migrate-gen     # gera migration a partir do schema (já funciona)
make seed            # E1 — cria criador 'fausto' + Persona Card + buckets
make ingest-fausto   # E1.2 — ManualUploadConnector lê data/fausto/
make eval            # E4 — harness das golden questions
```

## Como retomar uma sessão (procedimento para o Claude)

1. Leia este `PROGRESS.md` (estado e próxima tarefa).
2. Leia `CLAUDE.md` (regras inegociáveis).
3. Leia o épico atual em `docs/07-roadmap-backlog.md` para os critérios de aceite da próxima tarefa.
4. `git log --oneline -10` para conferir o que já está commitado.
5. `pnpm lint && pnpm test && pnpm typecheck` para confirmar que a base está sã.
6. Execute a próxima tarefa, escreva testes, marque o checkbox neste arquivo **e** no `docs/07-roadmap-backlog.md`, commite, push, e pare para revisão se for fim de épico.

## Regras inegociáveis (lembrete, fonte = CLAUDE.md)

1. **Guardrail anti-investimento (CVM)** é bloqueante (E3). Sem ele passando no eval (E4), o MVP não está pronto.
2. **`creator_id` em todo modelo e query**, mesmo single-tenant.
3. **Nunca chamar SDK de provedor fora dos adapters.**
4. **Toda conversa logada em `messages`** (tokens, custo, latência, fontes, guardrail_flag).
5. **Só conteúdo do próprio criador**, com consentimento (`consents`).
6. **"Mente digital" sempre explícita** ao usuário.
7. **Segredos só em `.env`** (nunca commitar).
