# PROGRESS — Estado atual do projeto

> **Para o Claude (e para você ao retomar):** este arquivo é a fonte da verdade do progresso. Atualize-o **toda vez** que uma tarefa do backlog for marcada como concluída. Cada commit que fecha tarefa deve mexer aqui também.
>
> A fonte completa de tarefas (com aceite) está em [`docs/07-roadmap-backlog.md`](docs/07-roadmap-backlog.md). Este arquivo é só o snapshot rápido.

## Onde estamos

- **Fase:** 0 — MVP single-tenant para o Fausto.
- **Épico atual:** **E6 — Frontend MVP ✅ CONCLUÍDO (5/5)**. 🎉 **FASE 0 COMPLETA (E0–E6).**
- **Próxima tarefa:** **Fase 1 — produtizar** (F1.x): F1.1 apify (onboarding semi-automático IG/YT/TikTok), F1.2 consentimento, F1.3 voz (ElevenLabs), etc. Ver `docs/07-roadmap-backlog.md §FASE 1`. **Parar para revisão humana / decisão de priorização da Fase 1.**
- **Último commit:** `2afad17 F1.x: onboarding self-signup (criar clone + conectar Instagram) — frontend`.
- **Testes:** 351 verdes (319 backend + 32 frontend). Lint + typecheck verdes.

> ✅ **F1.11 — Instagram por handle VALIDADO COM DADOS REAIS** (token Apify no `.env`): `@faustobassan` → **8 posts reais** (Groenlândia/Trump, eleições 2026, EUA×Irã, agricultura BR…) → docs+chunks indexados em ~16s; o chat respondeu "Por que Trump quer anexar a Groenlândia?" citando o post do IG `[1]`. Stack: scraper `backend/src/scrapers/` (`ApifyInstagramScraper` run-sync-get-dataset-items + `FakeInstagramScraper`) → `InstagramConnector` (ContentConnector) → reusa `syncContentSource`. Endpoint gated `POST /api/creators/:slug/sources/instagram {handle,limit?}`. Config: `SCRAPER_PROVIDER`/`APIFY_TOKEN`/`APIFY_INSTAGRAM_ACTOR`/`INSTAGRAM_RESULTS_LIMIT`. Markdown do chat também renderiza (react-markdown).
> ✅ **Fase 1 — onboarding/produto (self-signup) PRONTO E VERIFICADO.** Fluxo estilo Delphi: criar clone do zero → conectar Instagram → importa → conversar.
> - **Backend**: migration `0004_creator_owner.sql` (`creators.owner_user_id`); `POST /api/creators` (auth → cria clone, slug único via `slugify`, vira dono, promove subscriber→creator); `resolveOwnedCreator` enforce "cada criador só o seu" nos endpoints de Studio (operator fura).
> - **Frontend** `/onboarding` (client, multi-step): passo 1 nome→cria clone; passo 2 cola URL do IG (`parseInstagramHandle` aceita URL/@/handle)→importa com progresso (reusa F1.11); passo 3 "pronto" → Conversar (`/c/[slug]/chat`) + Studio. CTA "Criar minha mente digital" na home. Proxies BFF: `POST /api/creators` e `/api/creators/[slug]/sources/instagram`.
> - **Verificado**: `/onboarding` 200; criar clone via proxy → 201; import real do `@faustobassan` (F1.11) já validado. **351 testes verdes** (319 backend + 32 frontend). `next build` limpo.
> - **Decisões de produto pendentes (próximos passos sugeridos)**: (a) login hoje é e-mail+senha — pra "produto de verdade" falta tela de **signup** self-service (criar conta); (b) **YouTube público (F1.10)** pra completar "conectar contas"; (c) persona ainda não é auto-gerada do conteúdo importado (clone novo começa sem Persona Card → chat usa fallback até setar persona no Studio); (d) ownership ainda não cobre `conversations`/`messages` por dono.

> 🔑 **Como logar/testar localmente (verificado 2026-06-23)** — detalhes em memória `local_testing.md`:
> - **Usuário de teste** (Supabase local, conta descartável — NÃO é segredo de prod): `criador@fausto.local` / senha `fausto123`, papel **operator** (vê chat + Studio e fura o paywall). Recriar se o volume for resetado: `POST 127.0.0.1:54321/auth/v1/admin/users` com `apikey`+`Bearer`=`SUPABASE_SERVICE_ROLE_KEY` e `{"email","password","email_confirm":true}`, depois `UPDATE public.users SET role='operator' WHERE email='criador@fausto.local';`.
> - **Login:** use **e-mail+senha** em `/login` (botão "Entrar") — determinístico. Magic link é frágil (allowlist + hash de uso único).
> - **Supabase:** reiniciar sempre via `cd infra && supabase start --ignore-health-check` (project-id `supabase`; storage/studio podem ficar unhealthy e não importam). Acessar tudo por **localhost** (sessão é por origem).
> - **JWT é ES256/JWKS** (não HS256). Backend verifica os dois (`verifySupabaseToken`).

> 🔧 **Correções pós-Fase 0 (commit `ddc195d`)**: (1) login real estava 401 — Supabase assina **ES256**, backend só fazia HS256; agora faz os dois via JWKS. (2) `make eval` quebrado (CJS/ESM) → `eval/package.json` ESM. (3) Cohere 429 no eval → retry/backoff no reranker. (4) login page ganhou e-mail+senha. (5) `config.toml` liberou redirect p/ `127.0.0.1:3000/**`.

> 🎉 **Definition of Done da Fase 0 atingida**: Fausto indexado (5 docs/10 chunks); chat cita fontes; guardrail de investimento verde no eval (E4); login + paywall + checkout funcionando; **custo medido ~US$0,0036/resposta** (analytics E6.5, bem abaixo do alvo US$0,05); toda conversa logada em `messages`.

> ✅ **Follow-up E5.2 fechado no E6.3**: `requireAuth + requireAccess` agora protegem o `POST /api/chat` (slug resolvido do body via `resolveSlug` async; userId vem do JWT, creatorId do `access`). Os 13 testes de chat foram atualizados p/ provisionar subscriber+assinatura ativa e mandar JWT (+2 testes novos: 401 sem JWT, 402 sem assinatura).
> 🟡 **Follow-ups visuais E6.2**: (1) ✅ **markdown RESOLVIDO** — `MessageList` renderiza com `react-markdown` + `remark-gfm` + `@tailwindcss/typography` (`prose prose-invert`); (2) **streaming** — backend `/api/chat` é não-streaming, UI usa "pensando" (pendente, polimento).
> 🟡 **Stripe real (E6.3)**: o adapter Stripe de checkout está wireado (REST form-encoded via `node:fetch`) mas só foi smoke-testado com fetch mockado — o caminho **Fake** foi verificado end-to-end local. Pra produção: setar `STRIPE_SECRET_KEY` + `STRIPE_PRICE_ID` + `BILLING_PROVIDER=stripe` e validar com chaves de teste reais.

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

## Marco do E5.1 + E5.2 (referência rápida)

Auth (Supabase) + paywall prontos:
- **Trigger DB**: `auth.users` AFTER INSERT → `public.users` (external_id, email, role='subscriber'), idempotente. Migration `0002_auth_trigger.sql`.
- **JWT verify**: `backend/src/auth/jwt.ts::verifySupabaseJWT` HS256 com `node:crypto` (zero dep). `SUPABASE_JWT_SECRET` no Zod config.
- **Middlewares**: `requireAuth` (401 sem/inválido) e `requireAccess` (402 paywall com payload checkout). Operator/creator bypassam paywall.
- **Rotas demo**:
  - `GET /api/me` — protegida por `requireAuth`. Retorna `{id, externalId, email, role}` do usuário logado.
  - `GET /api/c/:slug/access` — protegida por `requireAuth + requireAccess`. Retorna `{allowed, creatorId, reason, subscriptionId}` ou 402 com payload de checkout.
- **Subscription "ativa"**: `status ∈ {active, trialing}` AND (`current_period_end IS NULL` OR > now).
- **Testes**: 261 no total (29 arquivos). E5 contribui 29 (jwt unit 7, me-api integração 6, checkAccess unit 8, access-api integração 7, ajustes config 1).

> ✅ **Follow-up E5.2 (RESOLVIDO no E6.3)**: `requireAuth + requireAccess` agora protegem o `POST /api/chat` também.

## Marco do E5.3 (referência rápida)

Webhook de billing idempotente pronto:
- **Adapter** (`backend/src/billing/`): interface `BillingProvider` + `StripeBilling` (verificação de assinatura Stripe `t=…,v1=…` via HMAC-SHA256 com `node:crypto`, zero dep — mesmo padrão do JWT do E5.1; tolerância anti-replay de 300s injetável) + `FakeBilling` (replica payloads Stripe, pula assinatura — usado em test) + `factory.ts` por `BILLING_PROVIDER`. Parser `parseStripeEventPayload` valida o evento via Zod e normaliza só `customer.subscription.*` (created/updated/deleted) → `BillingEvent`; outros tipos viram `null` (ack 200). `user_id`/`creator_id` vêm da `metadata` da subscription (setada no checkout, E6.3).
- **Service** (`services/billing.ts::processBillingEvent`): upsert em `subscriptions` com `onConflictDoUpdate` sobre `(provider, external_id)`. `xmax = 0` no returning distingue `inserted` vs `updated`.
- **Idempotência**: migration `0003_subscription_idempotency.sql` cria `UNIQUE (provider, external_id)`. Reprocessar o mesmo evento atualiza o row em vez de duplicar. NULLs continuam distintos (seed/test rows sem external_id coexistem).
- **Rota** (`api/billing.ts`): `POST /api/billing/webhook` público (assinatura É a auth). Lê raw body, adapter verifica+normaliza, service faz upsert. 400 em assinatura/payload inválidos; 200 `{received, ignored}` em evento ignorado; 200 `{received, subscriptionId, action}` no sucesso.
- **Config**: `BILLING_PROVIDER` (`stripe`|`fake`, default `fake` em test) no Zod; `STRIPE_WEBHOOK_SECRET` já existia.
- **Biome**: `backend/src/billing/**` já estava no allowlist de `noRestrictedImports` (SDK `stripe` liberado só ali) — mas a impl atual usa só `node:crypto`, sem SDK.
- **Testes**: 22 novos — 16 unit no adapter Stripe (8 parse: normalize/plan-fallback/canceled/null-unrelated/missing-metadata/malformed-json/bad-shape + 8 assinatura: valid/tampered/wrong-secret/missing-header/malformed-header/replay-tolerance/tolerance-0/no-secret) + 5 integração na rota (ignored→200, payload inválido→400, cria sub+libera acesso, reprocessa idempotente sem duplicar, cancela→bloqueia acesso 402) + 1 ajuste.

## Marco do E6.1 (referência rápida)

Landing pública do clone pronta (`/c/[slug]`), verificada end-to-end (curl → 200 com nome + "mente digital" + one-liner + chips + CTA + disclaimer; slug inválido → 404):
- **Endpoint público backend**: `GET /api/creators/:slug` (sem auth) → `services/creator.ts::getPublicCreator` retorna subconjunto curado `{slug, displayName, niche, oneLiner, disclaimer}`. `oneLiner`/`disclaimer` vêm do Persona Card (via `personaCardSchema.safeParse`); **não vaza** frameworks/do/dont/catchphrases (que alimentam o prompt). 404 se slug não existe.
- **Frontend** (Next.js 14, Server Component): `lib/api.ts::fetchCreator` (fetch SSR com `revalidate:60`, base `NEXT_PUBLIC_API_URL` default `http://localhost:3001`, 404→null, outros erros→throw). `lib/creator.ts` puro: `buildLandingView` (tagline com fallback one-liner→niche→neutro; disclaimer default leva o aviso "mente digital" da regra anti-engano §6; `initialsFor` p/ avatar) + `EXAMPLE_QUESTIONS` (3 chips creator-agnostic — campo na Persona p/ exemplos por criador fica p/ task futura). Página `app/c/[slug]/page.tsx`: header (avatar iniciais + nome + tag "mente digital"), tagline, chips "Experimente perguntar", CTA "Conversar com {nome}" → `/c/[slug]/chat`, disclaimer no rodapé. `generateMetadata` + `notFound()` para slug inexistente.
- **Import note**: frontend usa `moduleResolution: Bundler` → imports relativos **sem** extensão `.js` (webpack/Next não reescreve `.js`→`.ts`; só o backend NodeNext usa `.js`).
- **Env**: `.env.example` ganhou `NEXT_PUBLIC_API_URL` e `BILLING_PROVIDER` (este faltava do E5.3).
- **Testes**: 12 novos — 3 integração no endpoint (perfil curado, não-vazamento da persona, 404) + 9 unit no `lib/creator` (initialsFor 4 + buildLandingView 5). Total 295 verdes em 34 arquivos.

## Marco do E6.2 (referência rápida)

Chat `/c/[slug]/chat` estilo ChatGPT pronto, verificado end-to-end (page 200; POST via proxy → pipeline RAG real do Haiku citando [1], 1 fonte, sem guardrail):
- **Proxy BFF** (`app/api/chat/route.ts`): `POST /api/chat` same-origin que encaminha pro backend (`apiBaseUrl()`). Evita CORS no Hono e deixa o seam pra anexar o JWT do Supabase server-side quando o login existir (auth do chat adiada — ver aviso acima).
- **Camada pura** (`lib/chat.ts`, testada): tipos espelhando a resposta do backend + `sourceLabel`, `dedupeSources` (colapsa chunks do mesmo `documentId` → 1 chip, preserva ordem de rerank), `assistantMessageFromResponse` (mapeia fontes, marca guardrail quando `guardrailFlag='investment'`, zera fontes no `no_context`), `shouldSubmitOnKey` (Enter envia / Shift+Enter quebra / respeita IME), `postChat` (fetch pro proxy).
- **Componentes** (doc 11): `ChatRoom` (client, orquestra estado: messages, conversationId via ref, isSending, auto-scroll, "Nova conversa" reseta thread), `MessageList` (assistant à esquerda c/ avatar de iniciais + bolha; user à direita; `GuardrailNotice` discreto dourado — não vermelho; `ThinkingDots`; `Sources` como chips "de: <título>"), `Composer` (textarea auto-expansível, Enter envia, botão seta com `aria-label`), `EmptyState` (saudação + tagline + cartões de sugestão clicáveis que enviam). Página é Server Component que faz `fetchCreator` → `notFound()` se slug inválido → monta `<ChatRoom view={buildLandingView(...)} />`.
- **Disclaimer** sempre visível no rodapé do composer (regra anti-engano §6 + CVM).
- **Adiado (follow-up, não bloqueia aceite)**: enforcement de auth no `/api/chat` (espera login); render de **markdown** (hoje texto puro); **streaming** (backend não-streaming, UI usa "pensando").
- **Testes**: 10 novos unit no `lib/chat` (sourceLabel 2, dedupeSources 1, assistantMessageFromResponse 3, shouldSubmitOnKey 4). Total 305 verdes em 35 arquivos. (Os 13 testes de integração do chat seguem intactos — sem auth.)

## Marco do E6.3 (referência rápida)

Login + auth no chat + paywall + checkout prontos. **Verificado end-to-end local** (Fake billing): anon→gate login; authed-sem-assinatura→paywall (402); checkout→URL fake; webhook→ativa assinatura; access→liberado; chat authed→200.
- **Checkout backend**: `BillingProvider.createCheckoutSession` (Stripe via REST form-encoded com `node:fetch` + Fake que devolve a successUrl) + `POST /api/billing/checkout` (requireAuth; resolve creator; metadata `user_id/creator_id/plan` na subscription pro webhook do E5.3 reler; 503 `billing_not_configured` se faltar key/price). Config: `STRIPE_PRICE_ID`, `PUBLIC_APP_URL`.
- **Auth no chat** (fecha follow-up E5.2): `POST /api/chat` agora monta `requireAuth + requireAccess`. `requireAccess.resolveSlug` virou async (lê `creatorSlug` do body JSON; Hono cacheia o body, handler relê). `userId` vem do JWT, `creatorId` do `access`. Removido `userId` do body. 13 testes de chat atualizados (provisionam subscriber+assinatura ativa + JWT) +2 novos (401 sem JWT, 402 sem assinatura).
- **Login frontend**: `@supabase/supabase-js` (browser client singleton, `detectSessionInUrl`), `lib/useSession` (hook: status/accessToken/email/signOut), página `/login` (magic link via `signInWithOtp`, redirect p/ `/c/fausto/chat`). Capturável via Mailpit local (`:54324`).
- **Paywall + proxies**: `ChatRoom` usa `useSession`, pré-checa `GET /api/c/:slug/access` e renderiza gate: `loading`→"Verificando acesso", `anon`→"Entrar" (link /login), `blocked`→"Assinar" (→ checkout → redirect), `allowed`→Composer. Proxies BFF same-origin (`forwardToBackend` repassa `Authorization`): `app/api/chat`, `app/api/c/[slug]/access`, `app/api/billing/checkout`. TopBar mostra e-mail + "Sair".
- **Env**: `.env.example` ganhou `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`, `STRIPE_PRICE_ID`, `PUBLIC_APP_URL`. Para dev usar o checkout Fake: `BILLING_PROVIDER=fake`.
- **Testes**: 11 novos backend (5 checkout-api + 4 Stripe createCheckoutSession + 2 chat auth) = 296 backend. Frontend segue 20 (lib puro). **Total 316 verdes em 36 arquivos.** `next build` limpo (7 rotas, 3 proxies).

## Marco do E6.4 (referência rápida)

Studio do criador `/studio/[slug]` pronto, gated a creator/operator. **Verificado end-to-end local**: page 200; operator vê persona + 5 docs/10 chunks; subscriber → 403; e-mail/role via `/api/me`.
- **Role gating backend**: middleware `requireRole(...roles)` (lê `c.get('user').role`, 403 se fora; mount depois do `requireAuth`). Aplicado **por-método** nas rotas do creators router (via `router.get(path, ...studioGate, handler)`) p/ não gatear o público `GET /:slug` nem o `POST /:slug/documents` da ingestão.
- **Endpoints novos** (gated): `GET /api/creators/:slug/sources` (lista content_sources + status) e `GET /api/creators/:slug/documents` (docs + `chunkCount` via leftJoin/groupBy). `services/creator.ts::listSources/listDocuments`. **Persona GET/PUT** agora também gated (carregam do/dont/catchphrases que o landing público esconde de propósito).
- **Frontend**: `lib/studio.ts` puro (`canUseStudio`, `personaToForm`/`formToPersona` arrays↔linhas, `personaFormError` espelha o Zod) + clients (`fetchMe/fetchPersonaForm/savePersona/fetchSources/fetchDocuments`). `StudioRoom` (client): gate `loading/anon/forbidden/ready/error` via `useSession` + `/api/me`; editor de Persona (campos + textareas linha-a-linha, salvar), seções Fontes (badge de status) e Conteúdo indexado (chunkCount), botão "Testar o clone" → `/c/[slug]/chat`. Página Server Component faz `fetchCreator` (nome) → `notFound()`. 4 proxies BFF novos (`/api/me`, `/api/creators/[slug]/persona` GET+PUT, `/sources`, `/documents`).
- **Test churn**: `persona.test.ts` atualizado p/ autenticar como operator (+ teste 401/403). Novo `creators-studio-api.test.ts` (gating 401/403/200 + chunkCount).
- **Follow-ups**: lockdown de `POST /:slug/documents` + `POST /sources/:id/sync` (usados por tooling de ingestão — gatear exige token no CLI); "conectar fontes" via UI é F1.1 (Phyllo).
- **Testes**: 10 novos (3 studio-api + 1 persona-auth backend + 6 `lib/studio` frontend). **Total 326 verdes em 38 arquivos.** `next build` limpo (8 rotas + 7 proxies).

## Marco do E6.5 (referência rápida)

Analytics cards no Studio prontos. **Verificado contra dados reais do fausto**: 10 conversas, 10 respostas, custo total US$0,036, **~US$0,0036/resposta** (DoD < US$0,05 ✅), latência média 7,7s, taxa de guardrail 40%, top-5 perguntas rankeadas.
- **Backend** `services/analytics.ts::getCreatorAnalytics(db, creatorId)`: deriva tudo de `messages` + `conversations`. Aggregates via `count() filter (where ...)` por papel, `sum(cost_usd)`, `avg(latency_ms)` (só assistant), guardrail = `count filter guardrail_flag='investment'`. `topQuestions` agrupa user turns por `content` (desc, limit 5). Endpoint gated `GET /api/creators/:slug/analytics` (studioGate creator/operator).
- **Frontend**: `lib/studio.ts` ganha `fetchAnalytics` + formatters puros (`formatUsd` mais preciso < US$0,10, `formatPercent`, `formatLatency` ms/s/—). `StudioRoom` renderiza `AnalyticsSection` (grid de 6 cards + lista de perguntas frequentes) no topo. Proxy `/api/creators/[slug]/analytics`.
- **Testes**: 5 novos (2 analytics-api: gating 401/403 + aggregação com fixtures cost/guardrail/top; 3 formatters em `lib/studio`). **Total 331 verdes em 39 arquivos.** `next build` limpo.

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
- [ ] E1.5 (opcional MVP) Transcrição

> Em test, embeddings fake são default. Em dev, exige `OPENAI_API_KEY` com acesso a `text-embedding-3-small` no projeto OpenAI. Para `make worker` o Redis precisa estar de pé (`make up`).

### E2 — Núcleo RAG
- [x] **E2.1** Busca híbrida (vetorial + tsvector + RRF) — `backend/src/rag/retrieval.ts::hybridSearch`
- [x] **E2.2** Rerank top-50 → top-N + threshold + fallback `"no_context"` — `retrieveAndRerank` em `retrieval.ts`
- [x] **E2.3** Persona Card — schema Zod (`rag/persona.ts`), service `getPersonaCard`/`setPersonaCard`, rotas `GET|PUT /api/creators/:slug/persona`, seed do Fausto via `make seed` (idempotente; `SEED_FORCE_PERSONA=1` sobrescreve).
- [x] **E2.4** Prompt builders — `buildSystemPrompt(card)` estável (cacheável), `buildUserPrompt({query, chunks})` numerado, `buildLLMArgs` com `cacheSystemPrompt: true`. Smoke real com Haiku 4.5 retorna resposta citando [1]. ⚠️ Persona atual (~500 tokens) está abaixo do mínimo de cache do Anthropic (Haiku 2048; Sonnet 1024) — wiring correto mas cache só ativa quando persona/few-shots crescerem.
- [x] **E2.5** Orquestrador `POST /api/chat` — `services/chat.ts::processChat` faz query → embed → retrieveAndRerank → (LLM | fallback `no_context`) → persiste user+assistant em `messages` com model/tokens/costUsd/latencyMs/retrievedChunks. `rag/cost.ts` aplica pricing Anthropic com modificadores de cache (10% read, 125% write).
- [x] **E2.6** Roteamento Haiku ↔ Sonnet — `rag/routing.ts::pickModel` aplica heurísticas (`long_query` > 280 chars, `multi_question` > 1 `?`, `low_retrieval_confidence` top score < 0.3, ou `forced_*` via env `LLM_ROUTING_FORCE`). Loga cada decisão com signals; `routingReason` no response e em `messages.model`.

### E3 — Guardrails (BLOQUEANTE)
- [x] **E3.1** Classificador anti-investimento — `rag/guardrails.ts::detectInvestmentIntent` com 8 action patterns + 7 financial-term groups; high/medium/low confidence; `messages.guardrail_flag='investment'` persistido no DB.
- [x] **E3.2** Modo educacional forçado — `prompt.ts::EDUCATIONAL_MODE_PREAMBLE` prependido no user msg quando `guardrail.flag='investment'` (preserva cache do system); Claude real responde recusando recomendação, explicando cenário, listando perguntas-chave e fechando com o disclaimer.
- [x] **E3.3** Filtro pós-geração — `rag/guardrails.ts::detectDirectRecommendation` cobre 4 padrões (imperativo+ativo, imperativo+%, "recomendo X comprar Y", "você deve+verbo financeiro"). No `runAssistantTurn`: se a 1ª resposta viola, regenera 1x com `REINFORCED_RETRY_PREAMBLE` (system+history byte-identical → cache mantém); se 2ª também viola, devolve `buildSafeEducationalReply(personaName)` canned. Usage/cost/latency somados nas 2 chamadas; defense-in-depth: post-filter sobe `messages.guardrail_flag='investment'` mesmo se o pre-classifier deixou passar. API expõe `postFilter:{action:'pass'|'regenerated'|'replaced', category, signals}`.
- [x] **E3.4** Anti-alucinação + tom neutro — `buildSystemPrompt` ganha linha fixa "Mantenha tom neutro e factual; não tome lado partidário ou militante.". `rag/guardrails.ts::detectMissingCitations` flagra resposta ≥200 chars sem `[N]` quando há chunks. Em turnos não-`investment`, `runAssistantTurn` roda 2º pass: se falta citação, regenera com `CITATION_RETRY_PREAMBLE`; se ainda falta, substitui pela canned "Não tenho isso registrado nos conteúdos de {name}" (idêntica à do no_context, com `fontes:[]`). `PostFilterDecision.category` distingue `recommendation` vs `missing_citation` — só o primeiro escala pra `guardrail_flag='investment'`.

### E4 — Avaliação
- [x] **E4.1** `eval/golden.yaml` — 31 perguntas (12 geopolítica c/ fatos-âncora dos transcripts, 5 fé→no_context, 5 decisão de vida→no_context, 7 investimento→guardrail bloqueante, 2 safety→no_context). Schema Zod (`eval/schema.ts`) + loader (`eval/loader.ts` com `yaml`) + teste (`tests/eval-golden.test.ts`) garantindo ID kebab-case único, cobertura mínima por categoria, `guardrail_flag=investment` + must_not_contain "compre/venda/aloque" em todas de investimento, `fallback=no_context` + "não tenho isso registrado" em fé/decisão.
- [x] **E4.2** Harness `make eval` + CI gate — `eval/assertions.ts::evaluate` checa 6 dimensões (guardrail_flag, fallback, post_filter_category, must_contain_any, must_not_contain, requires_citation). `eval/runner.ts::runEval` puro orquestra question→chatRunner→evaluate→summarize. `eval/reporter.ts` agrega por categoria + custo total/médio + latência média e gera relatório texto + JSON. CLI em `backend/src/scripts/eval.ts` wirea services reais (createEmbedder/Reranker/LLMClient), conecta no DB, roda contra `processChat`, salva em `eval/reports/latest.json`, exit 1 se `passRate < EVAL_PASS_THRESHOLD` (default 0.8). `make eval` chama `pnpm --filter @second-brain/backend eval`. 18 testes novos (assertions + runEval com fake chatRunner).

### E5 — Auth, paywall, billing
- [x] **E5.1** Supabase Auth + trigger `on_auth_user_created` — migration `0002_auth_trigger.sql` cria `handle_new_auth_user()` (SECURITY DEFINER, search_path=public) + trigger AFTER INSERT em `auth.users` que insere em `public.users(external_id=NEW.id::text, email, role='subscriber')` com `ON CONFLICT (external_id) DO NOTHING`. `backend/src/auth/jwt.ts::verifySupabaseJWT` faz HMAC-SHA256 com `node:crypto` (zero dep), valida alg=HS256/sub/exp/assinatura. Middleware `requireAuth` (`api/middleware/require-auth.ts`) lê `Authorization: Bearer`, verifica JWT, faz look-up em `public.users` por `external_id`, seta `c.set('user', AuthenticatedUser)`. Rota demo `GET /api/me` protegida retorna `{id, externalId, email, role}`. `SUPABASE_JWT_SECRET` no Zod config. 14 testes novos: 7 unit do JWT verify (round-trip, bad signature, expired, malformed, alg=none, missing sub) + 6 integração (trigger replica auth→public, 401s pra header faltando/malformed/sig inválida/user não-provisionado, 200 com sub válido).
- [x] **E5.2** Middleware `requireAccess` — `services/access.ts::checkAccess` puro: operator/creator passam direto; subscriber precisa de `subscriptions` row com status `active`|`trialing` AND `current_period_end > now` (nulo conta como sem expiração). `api/middleware/require-access.ts::requireAccess` Hono middleware: lê `c.get('user')` (precisa do `requireAuth` antes), resolve slug → creator, chama checkAccess. 402 com `{error:'payment_required', reason, creatorId, creatorSlug, checkout:{url:null, message}}`. Rota demo `GET /api/c/:slug/access` (pré-flight pro frontend). 15 testes novos: 8 unit em checkAccess (operator, creator, active, trialing, no_sub, canceled, expired period, clock injection) + 7 integração na rota (401 sem JWT, 404 slug inválido, 402 no_sub, 402 expired, 200 active, 200 operator/creator bypass).
- [x] **E5.3** Webhook idempotente de billing — `POST /api/billing/webhook` + adapter `BillingProvider` (Stripe HMAC + Fake) + upsert idempotente em `(provider, external_id)`. Ver marco acima.

### E6 — Frontend MVP
- [x] **E6.1** Landing `/c/[slug]` — ver marco abaixo.
- [x] **E6.2** Chat `/c/[slug]/chat` (estilo ChatGPT) — ver marco abaixo.
- [x] **E6.3** Login (Supabase) + auth no `/api/chat` + paywall + checkout — ver marco abaixo.
- [x] **E6.4** Studio `/studio/[slug]` (persona editor + fontes/conteúdo + testar clone, gated) — ver marco abaixo.
- [x] **E6.5** Analytics cards (`GET /api/creators/:slug/analytics` + cards no Studio) — ver marco abaixo.

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
