# PROGRESS — Estado atual do projeto

> **Para o Claude (e para você ao retomar):** este arquivo é a fonte da verdade do progresso. Atualize-o **toda vez** que uma tarefa do backlog for marcada como concluída. Cada commit que fecha tarefa deve mexer aqui também.
>
> A fonte completa de tarefas (com aceite) está em [`docs/07-roadmap-backlog.md`](docs/07-roadmap-backlog.md). Este arquivo é só o snapshot rápido.

## Onde estamos

- **Fase:** 0 — MVP single-tenant para o Fausto.
- **Épico atual:** **E0 — Scaffolding & infra**.
- **Tarefa em andamento:** **E0.2 (WIP)** — código pronto; aguardando Docker para o smoke final.
- **Próxima ação:** rodar `make up && make migrate` quando o Docker Desktop estiver rodando, validar `\d chunks` mostrando HNSW + GIN, marcar checkbox.

### E0.2 — o que já foi feito (commit pendente)
- `infra/supabase/config.toml` gerado por `supabase init` (project_id = `second-brain`).
- Deps no backend: `drizzle-orm`, `drizzle-zod`, `drizzle-kit`, `postgres`, `dotenv`.
- `backend/drizzle.config.ts` apontando para `DATABASE_URL_DIRECT`.
- `backend/src/db/schema.ts` espelhando o `docs/04` inteiro (9 tabelas, vector(1536), tsvector custom type, HNSW + GIN + creator_idx + unique(creator_id, content_hash)).
- `backend/src/db/client.ts` (postgres-js + drizzle, pooler-safe).
- Migration `0000_curly_the_initiative.sql` (gerada + extensões pgvector/pg_trgm no topo).
- Migration `0001_tsv_and_storage.sql` (trigger `chunks_tsv_update` + bucket `creator-content`).
- `make migrate` / `make migrate-gen` plugados no `drizzle-kit`.

## ⛔ Bloqueios atuais

- **Docker Desktop não estava rodando antes do restart do PC.** Reabra após o restart.
  - O restart do macOS deve resolver. Após o boot: abrir Docker Desktop, esperar ícone "Engine running" verde.
  - Confirmação no terminal: `docker info --format '{{.ServerVersion}}'` — qualquer versão impressa = OK.

## ▶️ Roteiro exato de retomada (cole na próxima sessão)

```text
Olá Claude. Estou voltando ao projeto após reiniciar o PC.

1. Leia PROGRESS.md (este arquivo) e CLAUDE.md.
2. Confirme com `docker info --format '{{.ServerVersion}}'` que o Docker está ativo.
3. Continue o E0.2 do ponto exato:
   a. `make up` (sobe Supabase local + Redis local).
   b. Após o supabase start imprimir as chaves, copie para .env:
      SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
      DATABASE_URL, DATABASE_URL_DIRECT (locais).
   c. `make migrate` (aplica 0000 + 0001 via drizzle-kit).
   d. Smoke do schema: psql contra DATABASE_URL_DIRECT, rodar `\d chunks` e
      confirmar `chunks_embedding_hnsw_idx` (HNSW) e `chunks_tsv_gin_idx` (GIN).
   e. Smoke do trigger: `INSERT INTO chunks (creator_id, document_id, ordinal, text)`
      seguido de `SELECT tsv FROM chunks` — tsv deve estar populado.
   f. Smoke do bucket: `SELECT id FROM storage.buckets WHERE id='creator-content'`.
4. Marque o checkbox de E0.2 em docs/07-roadmap-backlog.md E em PROGRESS.md.
5. Atualize a seção "Decisões consolidadas" do PROGRESS.md trocando "Postgres 16"
   por "Postgres 17" (e nos docs 03/04/CLAUDE.md). É um achado real do E0.2.
6. Commit "E0.2: smoke + checkboxes" + push.
7. Pare para revisão antes do E0.3.
```

## Notas técnicas (E0.2)

- **Postgres 17** (default do Supabase CLI 2.107). Os docs `03/04/CLAUDE.md` mencionam "Postgres 16" — atualizar quando o smoke passar (passo 5 do roteiro acima).
- Migrations seguem o jeito Drizzle: cada `.sql` em `infra/supabase/migrations/` + journal em `meta/`. Snapshots da `meta/` são ignorados pelo Biome.
- Drizzle Kit usa `DATABASE_URL_DIRECT` (conexão direta) — o transaction pooler do Supabase quebra DDL.

## Estado do repo no restart

- **Último commit:** `6f7b3ad cleanup: remove stray supabase/ at root`.
- **Branch:** `main`, sincronizada com `origin/main`.
- **Working tree:** limpo (`git status` deve estar vazio ao voltar).
- **Containers Docker:** nenhum (Docker estava parado quando o usuário reiniciou).
- **`.env` local:** ainda não existe — criar do `.env.example` no passo 3b acima.

## Checklist da Fase 0

### E0 — Scaffolding & infra
- [x] **E0.1** Monorepo pnpm (backend Hono + frontend Next.js + Biome + Vitest + Makefile + healthcheck).
- [ ] **E0.2** Supabase CLI + Drizzle schema (tabelas/índices do doc 04) + bucket de Storage.
- [ ] **E0.3** Config tipada com Zod (`backend/src/config.ts`) + falha clara se faltar env.
- [ ] **E0.4** Adapters (llm/embeddings/rerank/transcription + connectors `ManualUpload`) com fakes para testes.

### E1 — Ingestão & second brain (pendente)
- [ ] E1.1 Schema Drizzle + tipos Zod
- [ ] E1.2 `POST /documents` + `make ingest-fausto`
- [ ] E1.3 Chunking + embeddings + tsvector
- [ ] E1.4 Worker BullMQ
- [ ] E1.5 (opcional) Transcrição

### E2 — Núcleo RAG (pendente)
- [ ] E2.1 Busca híbrida (vetorial + BM25 + RRF)
- [ ] E2.2 Rerank Cohere
- [ ] E2.3 Persona Card (modelo + seed Fausto + endpoint)
- [ ] E2.4 Prompt + caching
- [ ] E2.5 Orquestrador `POST /api/chat`
- [ ] E2.6 Roteamento Haiku/Sonnet

### E3 — Guardrails (BLOQUEANTE) (pendente)
- [ ] E3.1 Classificador anti-investimento
- [ ] E3.2 Modo educacional + disclaimer
- [ ] E3.3 Filtro pós-geração
- [ ] E3.4 Anti-alucinação + tom neutro

### E4 — Avaliação (pendente)
- [ ] E4.1 `eval/golden.yaml` (~30 perguntas)
- [ ] E4.2 Harness `make eval` + CI gate

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
- **DB + Auth + Storage:** **Supabase** (Postgres 16 + pgvector + Auth + Storage). Dev local via `supabase start`.
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

### Comandos do dia a dia
```bash
# Setup
pnpm install                    # instala deps de todos os workspaces
cp .env.example .env            # preencha as chaves de provedor

# Subir infra local (Redis + Supabase) — Supabase CLI é necessário a partir do E0.2
make up

# Desenvolver
pnpm --filter @second-brain/backend dev    # backend em :3001 (watch)
pnpm --filter @second-brain/frontend dev   # frontend em :3000 (watch)
# ou tudo junto:
make dev

# Qualidade
pnpm lint                       # Biome
pnpm test                       # Vitest (todos os workspaces)
pnpm typecheck                  # tsc --noEmit nos 2 workspaces

# Healthcheck rápido
curl http://localhost:3001/api/health
# → {"status":"ok","service":"second-brain-backend","timestamp":"..."}

# Parar infra
make down
```

### Comandos previstos (implementados nos próximos épicos)
```bash
make migrate         # E0.2 — drizzle-kit migrate
make migrate-gen     # E0.2 — gera migration a partir do schema
make seed            # E0.2/E1 — cria criador 'fausto' + Persona Card + buckets
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
