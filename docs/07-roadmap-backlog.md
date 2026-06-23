# 07 — Roadmap e Backlog (executável pelo Claude Code)

> Execute em ordem. Cada tarefa tem critérios de aceite. Marque o checkbox ao concluir, escreva testes, rode `make test`/`make lint`, e **pare ao fim de cada épico para revisão humana**. Cada tarefa ≈ 1 PR.

---

## FASE 0 — MVP single-tenant (Fausto)

### Épico E0 — Scaffolding & infra
- [x] **E0.1** Monorepo **pnpm workspaces** com `/backend` (Hono + TS), `/frontend` (Next.js 14 + TS), `/infra`, `/docs`, `/eval`, `/data/fausto`. Biome + Vitest configurados na raiz. Makefile fino expõe os comandos do doc 08 (`make up`, `make dev`, etc.).
  - *Aceite:* `pnpm install` na raiz instala tudo; `make up` sobe Supabase local (CLI) + Redis (docker-compose) + backend + frontend; healthcheck `GET /api/health` responde 200; `pnpm lint` e `pnpm test` rodam sem erro.
- [x] **E0.2** Supabase CLI configurada (`infra/supabase/config.toml`); Drizzle ORM + Drizzle Kit configurados; schema em `backend/src/db/schema.ts` espelhando o doc 04 (todas as tabelas + índices HNSW/GIN + extensões `vector` e `pg_trgm`).
  - *Aceite:* `make migrate` roda `drizzle-kit migrate` contra `DATABASE_URL_DIRECT` e aplica todas as tabelas/índices; `\d chunks` no psql mostra HNSW em `embedding` e GIN em `tsv`. Bucket `creator-content` criado no Supabase Storage via migration/script.
- [x] **E0.3** Camada de config (.env do doc 08) + carregamento tipado com **Zod** (`backend/src/config.ts`).
  - *Aceite:* app falha no boot com mensagem clara se faltar env obrigatória; envs de provedor têm valores default seguros em modo `test` (usam fakes).
- [x] **E0.4** Adaptadores de provedor em TS com interface (`llm/`, `embeddings/`, `rerank/`, `transcription/`) + camada `connectors/` (interface `ContentConnector` + `ManualUploadConnector` que lê `data/fausto/`). Cada um tem implementação real + fake para testes.
  - *Aceite:* trocar provedor é mudar 1 env/factory; testes do RAG (E2) usam fakes determinísticos; chamar SDK fora do adapter quebra o lint (regra do Biome / convenção revisada em PR).

### Épico E1 — Ingestão & second brain
- [x] **E1.1** Schema Drizzle (`backend/src/db/schema.ts`) + tipos Zod para input/output de cada tabela do doc 04 (publicados como `backend/src/db/types.ts`).
  - *Aceite:* `pnpm test` valida que cada tabela tem schema Zod de insert/select; tipos derivados via `drizzle-zod`.
- [x] **E1.2** Ingestão manual de conteúdo via `ContentConnector` (`ManualUploadConnector` lê `data/fausto/`) + endpoint `POST /api/creators/{slug}/documents`. Comando `make ingest-fausto` aciona o connector.
  - *Aceite:* arquivos em `data/fausto/` viram `documents` com `content_hash` (sha256 do `raw_text`); reprocessar não duplica (UNIQUE `creator_id, content_hash`).
- [x] **E1.3** Pipeline de chunking (300–500 tokens, overlap 15%) + embeddings (`Embedder` adapter) + `tsvector('portuguese')` populado por trigger.
  - *Aceite:* `chunks` populados com `embedding` e `tsv`; índice HNSW em uso (`EXPLAIN (ANALYZE)` mostra `Index Scan using chunks_embedding_idx`); contagem de chunks bate com fixtures.
- [x] **E1.4** Worker BullMQ de ingestão (processo separado em `backend/src/workers/ingest.ts`) com status em `content_sources`.
  - *Aceite:* `POST /sources/{id}/sync` enfileira job; status vai `pending → indexing → indexed`; idempotente (rodar 2x não duplica chunks).
- [ ] **E1.5** (Opcional MVP) Transcrição de áudio/vídeo via `Transcriber` adapter (Deepgram).
  - *Aceite:* arquivo de áudio PT em `data/fausto/audio/` vira transcript em `documents` (`kind='transcript'`).

### Épico E2 — Núcleo RAG
- [x] **E2.1** Busca híbrida: vetorial (cosine, top-50) + textual (ts_rank) fundidas por RRF.
  - *Aceite:* função `hybrid_search(creator_id, query)` retorna candidatos rankeados; testada com fixtures.
- [x] **E2.2** Rerank (Cohere) top-50 → top-5 com limiar de score.
  - *Aceite:* abaixo do limiar retorna vazio → caminho "não tenho isso registrado".
- [x] **E2.3** Persona Card: modelo, seed do Fausto (doc 05), endpoint GET/PUT.
- [x] **E2.4** Montagem de prompt + system prompt com prompt caching da Persona Card.
  - *Aceite:* chamadas reusam o bloco cacheado; custo de entrada cai (verificar nos logs).
- [x] **E2.5** Orquestrador de resposta: query→retrieval→rerank→LLM→resposta + persistência completa em `messages` (tokens, custo, latência, fontes).
  - *Aceite:* `POST /api/chat` responde citando fontes; `messages` preenchida.
- [x] **E2.6** Roteamento de modelo por complexidade (Haiku default, Sonnet fallback).
  - *Aceite:* perguntas simples usam Haiku; logs mostram o roteamento.

### Épico E3 — Guardrails (BLOQUEANTE para lançar)
- [x] **E3.1** Classificador de intenção de investimento (regras + LLM barato) na entrada.
  - *Aceite:* perguntas tipo "que cripto comprar" são detectadas (cobertura validada no eval).
- [x] **E3.2** Modo educacional forçado + disclaimer quando detectado; `guardrail_flag='investment'`.
- [x] **E3.3** Filtro pós-geração que bloqueia recomendação direta ("compre/venda/aloque X%").
  - *Aceite:* nenhuma resposta do eval de investimento contém recomendação direta.
- [x] **E3.4** Guardrail anti-alucinação (sem contexto → "não tenho isso registrado") e tom neutro.

### Épico E4 — Avaliação
- [x] **E4.1** `eval/golden.yaml` com ~30 perguntas (geopolítica, fé, decisão de vida, investimento→guardrail).
- [x] **E4.2** Harness `make eval`: acerto factual, "soa como o criador" (avaliador LLM), taxa de guardrail, custo médio.
  - *Aceite:* relatório com métricas; CI falha em regressão abaixo do baseline (doc 01).

### Épico E5 — Auth, paywall e billing
- [x] **E5.1** Integração **Supabase Auth** (e-mail/magic link + OAuth Google); trigger `on_auth_user_created` replica para `public.users` com `external_id = auth.users.id` e `role` default `subscriber`. Middleware Hono valida JWT do Supabase e injeta `user` no contexto.
  - *Aceite:* signup pelo frontend cria linha em `public.users`; chamadas sem JWT recebem 401; JWT inválido recebe 401.
- [x] **E5.2** Middleware `requireAccess(creatorSlug)` (paywall) conforme doc 06.
  - *Aceite:* assinante ativo passa; sem assinatura recebe 402 com payload de checkout; criador/operador sempre passa.
- [x] **E5.3** Webhook de billing idempotente (`POST /api/billing/webhook`) cria/atualiza `subscriptions` (Stripe no MVP; Hotmart/Kiwify por trás da mesma interface).
  - *Aceite:* assinatura de teste libera acesso; cancelamento bloqueia; reprocessar o mesmo evento (mesmo `external_id`) não duplica.

### Épico E6 — Frontend MVP
- [x] **E6.1** Landing do clone (`/c/[slug]`) com exemplos e CTA + disclaimer.
- [ ] **E6.2** Chat (`/c/[slug]/chat`) com fontes, badge de guardrail, disclaimer, streaming.
- [ ] **E6.3** Paywall/checkout e retorno validando assinatura.
- [ ] **E6.4** Studio do criador (`/studio`): fontes, status, editor de Persona, analytics, "testar clone".
- [ ] **E6.5** Analytics cards (conversas, custo, perguntas top, taxa de guardrail).

> **Definition of Done da Fase 0:** Fausto indexado; chat responde no estilo dele citando fontes; guardrail de investimento passa no eval; paywall funcionando; custo/conversa < US$0,05; logs completos.

---

## FASE 1 — Produtizar (1–3 criadores)
- [ ] **F1.1** Onboarding semi-automático: implementar `PhylloConnector` (adapter da interface `ContentConnector` criada no E0.4) cobrindo Instagram + YouTube + TikTok via OAuth do Phyllo + webhook de novo conteúdo + transcrição automática. Pré-requisito: criador com conta Business/Creator no IG. Ver `docs/12-connectors.md`.
- [ ] **F1.2** Consentimento (tabela `consents`) no onboarding: conteúdo, voz, imagem (upload de contrato). Regra "só clone de si mesmo" + verificação de identidade.
- [ ] **F1.3** Voz: adaptador ElevenLabs (PVC); resposta falada opcional; gate por plano Pro. (Prioridade alta — voz retém ~5x mais; doc 10.)
- [ ] **F1.4** Canal WhatsApp/Telegram (webhook → mesmo pipeline).
- [ ] **F1.5** Multi-criador real no Studio (cada criador só vê seus dados).
- [ ] **F1.6** **Interview mode** (doc 10): gerar perguntas direcionadas a partir das lacunas da persona; respostas viram `documents` de alta confiança e atualizam a Persona Card.
- [ ] **F1.7** Política de uso + aviso "você fala com a mente digital" visível na UI; bloquear categorias proibidas (políticos, conteúdo adulto).
- [ ] **F1.8** **Enrichment pipeline (Delphi-style)** — antes de embedar, o chunker chama Haiku para gerar (a) um sumário curto do chunk + (b) 3-5 perguntas hipotéticas que aquele chunk responde. Tudo é embedado: o chunk original, o sumário e cada pergunta (mesmo `chunk_id`, novo `chunks.enriched_kind ∈ {raw, summary, question}`). `hybridSearch` retorna o melhor row por `chunk_id` (dedup) — o LLM continua vendo só o `text` raw.
  - *Por quê:* transcrições de reel têm muito ruído oral; perguntas pré-geradas casam melhor com a query do usuário (similaridade pergunta↔pergunta > pergunta↔fala bruta). É a "Additional Context" do diagrama do case study Pinecone/Delphi.
  - *Custo:* Haiku ~US$0,0005 por chunk × 10 chunks do Fausto = ~US$0,005 pra reindexar do zero.
  - *Trigger:* puxar essa task pra antes da F1.5 (KG) se o eval do E4 mostrar passRate < 0.85 em queries indiretas/parafraseadas. KG na F1.5 também ganha um corpus melhor.
  - *Aceite:* novo enum `enriched_kind` na coluna `chunks`; reindex idempotente; eval rerunado com ganho ≥ 5pp no passRate de geopolítica (ou justifique a regressão).

## FASE 1.5 — Camada de fidelidade (knowledge graph) — ver doc 10
- [ ] **F1.5.1** Extração de entidades/relações/princípios por LLM → `kg_entities`/`kg_relations` com `confidence`.
- [ ] **F1.5.2** Recuperação híbrida++ (vetorial + sub-grafo) na orquestração.
- [ ] **F1.5.3** Modo de extrapolação a partir de princípios (resposta marcada como inferida, respeitando guardrails).
- [ ] **F1.5.4** Slider de leniência (quanto o clone pode extrapolar); registrar nível em `messages`.
- [ ] **F1.5.5** (Opcional) Dimensão temporal do grafo (`valid_from`/`valid_to`).

## FASE 2 — SaaS self-service
- [ ] **F2.1** Cadastro self-service de criador + fluxo de onboarding guiado.
- [ ] **F2.2** Planos (Free/Criador/Pro/Enterprise) + billing por plano + limites de uso.
- [ ] **F2.3** Branding/custom domain por criador; múltiplos embeds.
- [ ] **F2.4** Custos: cache de respostas, roteamento, migração de vector DB se o volume exigir. **Trigger:** > 5M vetores OU > 50 QPS sustentado. Opções a avaliar nessa hora: **Qdrant self-host** (~$50-100/mês num VPS, controle total) vs **Pinecone Serverless** (managed, ~$50-200/mês, mesmo provedor que o Delphi usa). Como temos o `Embedder` em adapter, a troca é trocar 1 implementação — não é rewrite.
- [ ] **F2.5** Mind Visualization como feature (doc 09).

---

## Princípios ao executar
- `creator_id` em tudo, mesmo na Fase 0.
- Nunca chamar SDK de provedor fora dos adaptadores.
- Toda conversa logada (custo/fontes).
- Guardrail de investimento é bloqueante — não lançar sem E3 verde no eval.
