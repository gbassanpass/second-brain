# PROGRESS — Estado atual do projeto

> **Para o Claude (e para você ao retomar):** este arquivo é a fonte da verdade do progresso. Atualize-o **toda vez** que uma tarefa do backlog for marcada como concluída. Cada commit que fecha tarefa deve mexer aqui também.
>
> A fonte completa de tarefas (com aceite) está em [`docs/07-roadmap-backlog.md`](docs/07-roadmap-backlog.md). Este arquivo é só o snapshot rápido.

## Onde estamos

- **Fase:** 0 — MVP single-tenant para o Fausto.
- **Épico atual:** **E0 — Scaffolding & infra**.
- **Próxima tarefa:** **E0.2** — Supabase CLI + Drizzle ORM + schema do `docs/04-data-model.md` + bucket de Storage.
- **Último commit:** `d9efdfb docs: add PROGRESS.md and refresh README`.

## ⛔ Bloqueios atuais

- **E0.2 aguarda Docker Desktop rodando.** `supabase start` precisa do Docker (sobe Postgres + Auth + Storage locais). Supabase CLI 2.107 já está instalado.
  - **Ação do usuário:** instalar [Docker Desktop](https://www.docker.com/products/docker-desktop/), abrir, esperar o ícone ficar verde (status "Engine running") e me avisar.
  - Ao retomar: confirmar com `docker info --format '{{.ServerVersion}}'` (qualquer versão impressa = OK). Daí o Claude pode tocar o E0.2 ponta a ponta com smoke completo.

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
