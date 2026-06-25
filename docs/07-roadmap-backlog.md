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
- [x] **E6.2** Chat (`/c/[slug]/chat`) com fontes, badge de guardrail, disclaimer, streaming. *(streaming e markdown ficaram como follow-up — backend `/api/chat` é não-streaming. Auth no chat foi wireada no E6.3.)*
- [x] **E6.3** Paywall/checkout e retorno validando assinatura. *(Login Supabase magic link + auth wireada no `/api/chat` (fechou follow-up E5.2) + gating de paywall + checkout via adapter. Stripe real só fumaça — caminho Fake verificado end-to-end local.)*
- [x] **E6.4** Studio do criador (`/studio/[slug]`): fontes+status, conteúdo indexado, editor de Persona, "testar clone". Gated a creator/operator. *(Analytics → E6.5. "Conectar fontes" via UI → F1.1 Phyllo; no MVP a ingestão é via pipeline/CLI. Lockdown de POST documents + sources sync = follow-up.)*
- [x] **E6.5** Analytics cards (conversas, custo, perguntas top, taxa de guardrail). Endpoint gated `GET /api/creators/:slug/analytics` + cards no Studio.

> **Definition of Done da Fase 0:** Fausto indexado; chat responde no estilo dele citando fontes; guardrail de investimento passa no eval; paywall funcionando; custo/conversa < US$0,05; logs completos.
>
> ✅ **Fase 0 COMPLETA** (E0–E6 todos fechados). Fausto indexado (5 docs/10 chunks); chat cita fontes; guardrail de investimento verde no eval (E4); paywall + checkout + login funcionando; custo medido ~US$0,0036/resposta (analytics E6.5); toda conversa logada em `messages`. Próximo: Fase 1 (produtizar — F1.x).

---

## FASE 1 — Produtizar (1–3 criadores)
- [ ] **F1.2** Consentimento (tabela `consents`) no onboarding: conteúdo, voz, imagem (upload de contrato). Regra "só clone de si mesmo" + verificação de identidade.
- [x] **F1.3** Voz: **TTS da resposta** ✅ — adaptador `voice/` (ElevenLabs real + fake + factory), `POST /api/voice` (gate de acesso = chat), botão "Ouvir" no chat (lazy + cache + play/pause). Usa `creators.voiceId` ou voz **premade** padrão (`eleven_multilingual_v2` p/ PT-BR). Integração provada contra a API real (aceita a voz; conta free esbarra só em quota de créditos). Testes: `voice-api.test.ts`. **Falta (follow-up, exige plano pago):** clonar a voz real do criador (IVC/PVC) + gate por plano Pro + persistir `voiceId` clonado. (Voz retém ~5x mais; doc 10.)
- [ ] **F1.3b** **Chamada de voz em tempo real ("ligar pro clone")** — conversa full-duplex estilo Delphi (`/call`): você fala → ASR → RAG/persona → TTS da voz clonada → áudio, com VAD, turn-taking, **barge-in** (interrupção) e latência sub-segundo. **Decisão travada: usar o ElevenLabs Conversational AI (Agents)**, reaproveitando a voz clonada (`creators.voiceId`) + nossa RAG/guardrails CVM como "cérebro" do agente (LLM custom / tool webhook). Transporte WebRTC no browser. **Gate por plano Pro** (voz em tempo real é o item mais caro → "Unlimited" do Delphi = paywall). *Fase 1.5+, depois de TTS (F1.3 ✅) e clonagem de voz paga.* Alternativa só se precisar de controle fino de custo/guardrail: LiveKit + Deepgram (já em `transcription/`) + Claude + ElevenLabs TTS.
- [ ] **F1.4** Canal WhatsApp/Telegram (webhook → mesmo pipeline).
- [ ] **F1.5** Multi-criador real no Studio (cada criador só vê seus dados).
- [ ] **F1.6** **Interview mode** (doc 10): gerar perguntas direcionadas a partir das lacunas da persona; respostas viram `documents` de alta confiança e atualizam a Persona Card.
- [ ] **F1.7** Política de uso + aviso "você fala com a mente digital" visível na UI; bloquear categorias proibidas (conteúdo adulto).
- [x] **F1.8** **Enrichment pipeline (Delphi-style)** ✅ — para cada chunk raw, o LLM (Haiku) gera um resumo + 3-5 perguntas hipotéticas que ele responde; cada um vira uma LINHA em `chunks` com seu próprio embedding, ligada ao raw por `parent_chunk_id` (`enriched_kind ∈ {raw, summary, question}`, migration 0010). `hybridSearch` deduplica por chunk lógico (`COALESCE(parent_chunk_id, id)`, melhor rank por leg) e **sempre devolve o texto raw** — o LLM nunca vê resumo/pergunta. Roda no job de background `kg-build` (`enrichCreatorChunks`, idempotente: só chunks raw sem filhos). Provado: query que casa a pergunta hipotética traz o chunk raw (`enrich-chunks.test.ts`); retrieval com dados raw-only fica idêntico. **Follow-up:** enrich também no Add Knowledge manual (hoje só no path de import); tuning do pool p/ recall com fan-out alto.
  - *Por quê:* transcrições de reel têm muito ruído oral; perguntas pré-geradas casam melhor com a query do usuário (similaridade pergunta↔pergunta > pergunta↔fala bruta). É a "Additional Context" do diagrama do case study Pinecone/Delphi.
  - *Custo:* Haiku ~US$0,0005 por chunk × 10 chunks do Fausto = ~US$0,005 pra reindexar do zero.
  - *Trigger:* puxar essa task pra antes da F1.5 (KG) se o eval do E4 mostrar passRate < 0.85 em queries indiretas/parafraseadas. KG na F1.5 também ganha um corpus melhor.
  - *Aceite:* novo enum `enriched_kind` na coluna `chunks`; reindex idempotente; eval rerunado com ganho ≥ 5pp no passRate de geopolítica (ou justifique a regressão).

### Inspirado nos screenshots do Delphi (jun/2026) — features candidatas
> Análise tela-a-tela do Delphi. Ordenadas por ROI/risco. Decidir priorização com humano.

- [x] **F1.9** **`AddKnowledge` no Studio (ingestão self-service)** ✅ — painel "Adicionar conhecimento" dono-only com 4 abas: **Texto/nota**, **Q&A**, **URL** (fetch+extrai HTML→texto) e **Arquivo** (.txt/.md/.pdf via `unpdf`) — todos `addKnowledge` (upsert + index inline). Endpoints: `POST /:slug/knowledge` (note/qa), `/knowledge/url`, `/knowledge/file` (multipart). **+ Resync de fonte** (`POST /:slug/sources/:id/resync`, botão "Atualizar" → re-puxa Instagram). YouTube ainda "em breve" (transcript instável). Train (F1.12) reusa `addKnowledge({type:'qa'})`. Testes: `knowledge-api`, `source-text` (html/url/file), `document-detail-api`.
- [ ] **F1.10** **`YouTubeConnector` público (sem OAuth)** — dado a URL/handle de um canal, usa a **YouTube Data API v3** (só API key, dados públicos, **sem login do criador**) pra listar os vídeos → baixa legendas/áudio → transcreve (`Transcriber`) → `documents`. *Esse é o "só colar a URL e puxar" que o Delphi faz pro YouTube, e é 100% legítimo via API oficial. Forte candidato a vir ANTES do Phyllo (F1.1) — onboarding sem fricção de OAuth.*
- [x] **F1.11** **Ingestão de Instagram público por handle** — ✅ **VALIDADO COM DADOS REAIS** (token Apify configurado; `@faustobassan` → 8 posts reais → docs+chunks indexados em ~16s; chat respondeu "Por que Trump quer anexar a Groenlândia?" citando o post do IG). Build: Decisão tomada (dono autorizou; é o conteúdo do próprio criador, consentido). Implementado via **Apify** (`backend/src/scrapers/`): `InstagramScraper` (`ApifyInstagramScraper` run-sync-get-dataset-items + `FakeInstagramScraper`) → `InstagramConnector` (ContentConnector) → reusa `syncContentSource` (dedup + index + status). Endpoint gated `POST /api/creators/:slug/sources/instagram {handle, limit?}`. Caminho **Fake** verificado end-to-end (integração). **Falta:** `APIFY_TOKEN` real pra puxar um perfil de verdade + validar a qualidade do conteúdo extraído. ⚠️ Lembrete: scraping de IG é ToS-gray (perfil próprio/consentido) e frágil; Apify é o caminho gerenciado.
- [x] **F1.12** **Loop de feedback de treino no chat** ✅ (rating + correção → vira documento Q&A indexado de alta prioridade; o RAG passa a usar. Verificado: ensinei "comida favorita" → o clone passou a responder com a versão ensinada citando a fonte). Detalhes — (Delphi "Is this how you'd answer?" + "help improving this response") — no modo Studio/preview, cada resposta do clone ganha um rating rápido (Nada↔Exato) e um fluxo "melhorar resposta" (longo demais? tom? falta algo?). O feedback vira `documents` de alta confiança / ajustes na Persona. *Casa com F1.6 (interview mode) — é a mesma máquina de fidelidade, pela ótica de corrigir respostas ruins em vez de só preencher lacunas.*
- [x] **F1.13** **Lista de conversas do criador no Studio** ✅ (seção Conversas master/detail: lista por 1ª pergunta + nº de mensagens, clica e vê a conversa; gated+owned; não vaza conversa de outro criador). Era — — aba "Conversations" (Me / Minha audiência) com histórico navegável. Já temos os dados (`conversations`/`messages`); falta a UI. *Baixo risco.*
- [x] **F1.14** **Mind Score** ✅ — métrica real de cobertura/maturidade (0–100) derivada de dados, não vanity: **persona** (15) + **conhecimento** (50 = 35 chunks + 15 docs) + **treino** (15, Q&A ensinados) + **confiança** (20 = % de respostas que acharam contexto vs "não tenho isso registrado"). Barra **Iniciante→Aprendiz→Experiente→Mestre** + breakdown por dimensão + **próximo passo** (maior lacuna vira nudge acionável). `getMindScore` + `GET /:slug/mind-score` (dono); card no topo de Insights. Testes: `mind-score.test.ts` (vazio=0/iniciante; dataset controlado=64/experiente). Real do fausto-bassan hoje: 63/Experiente.
- [~] **F1.15** (Fase 2) **Audience/CRM** — 🟡 parcial: seção Audiência já lista **quem entrou** via código (e-mail, código usado, data) + **engajamento** (nº de conversas + última atividade) via `GET /:slug/audience` (`listAudience`). Falta (Fase 2): tags, export/sync CRM, audiência por assinatura paga (não só código).

- [x] **F1.16** **Studio shell estilo Delphi (menu lateral + seções)** ✅ (sidebar: Insights/Conversas/Audiência/Conhecimento/Persona/Treinar; Conversas/Audiência/Treino-loop como placeholders). Resta — restruturar a área do criador num app único com sidebar: **Insights** (analytics — E6.5 ✅), **Conversations** (F1.13), **Audience** (F1.15/F1.17), **Knowledge** (lista + Add Knowledge F1.9), **Profile/Persona** (editor — E6.4 ✅), **Train** (F1.12). Hoje são páginas soltas; falta o layout com nav. **Estrutural — base das outras.**
- [x] **F1.17** **Controle de acesso da audiência (código de acesso)** ✅ — criador gera **códigos** na seção Audiência do Studio (rótulo + limite de usos opcional + ativar/desativar + copiar link `/c/:slug/chat?code=`); quem resgata ganha acesso sem pagar. Tabelas `access_codes`/`access_grants` (migration 0005); `checkAccess` honra grant (reason `access_code`) ao lado da assinatura; `POST /api/c/:slug/redeem` (auth-only, **antes** do paywall; transacional com lock p/ respeitar `maxRedemptions`; idempotente por (user,creator)); CRUD dono-only em `/api/creators/:slug/access-codes`. No chat bloqueado: "Tenho um código" + auto-resgate via `?code=`. Testes: `access-codes-api.test.ts` (owner-only, redeem, 422 inválido/inativo, maxRedemptions). **Follow-up:** liberar por e-mail/lista + shortlink de pagamento dedicado.
- [x] **F1.18** **Mind Visualization 3D** ✅ (versão documentos↔chunks) — grafo 3D `creator → documentos → chunks` (drag/zoom/hover) com `react-force-graph-3d` (three.js), seção **Mente 3D** no Studio. Backend `getMindGraph` + `GET /:slug/graph` (dono; chunks capados em 400 c/ flag `truncated`). Lib client-only via `next/dynamic` (ssr:false). Testes: `mind-graph.test.ts` (estrutura nós/links + cap/truncated). **Versão fiel (entidades/relações/princípios) depende da F1.5 (KG) — ver doc 09 + F2.5.**
- [x] **F1.20** **Autocomplete dinâmico no chat** ✅ — o empty-state do `/c/:slug/chat` agora mostra perguntas de partida **geradas do grafo do clone** (top temas/princípios por grau), não mais 3 chips genéricos. Geradas (1 chamada LLM) e **cacheadas** em `creators.suggested_questions` (migration 0009) **dentro do job de background do grafo** (kg-build) → regeneram a cada importação, custo zero por visita. Endpoint público `GET /:slug/suggested-questions`; `EmptyState` busca e cai no fallback estático se vazio. Testes: `suggested-questions.test.ts` (gera+cacheia+lê; grafo vazio→[]).
- [ ] **F1.19** **Perfis explícitos (audiência vs criador)** — hoje o papel é inferido por contexto: link de chat compartilhado → audiência (volta pro chat via `?redirect=`, fix em `1d4b59e`); signup direto → criador (`/onboarding`). Falta: (a) escolha explícita no signup ("Quero criar minha mente" vs "Quero conversar"), (b) marcar `users.role='creator'` ao concluir o onboarding (hoje o papel depende de como o user foi criado no banco), (c) gating de UI por papel (audiência não vê CTA de "criar mente"). Toca consentimento (F1.2) e multi-tenant (F2.1).

> **Mapa Delphi → backlog (telas jun/2026):** menu lateral ❌F1.16 · Train ❌F1.12 · Conversations ❌F1.13 (dados existem) · Insights 🟡(analytics✅ E6.5, Mind Score ❌F1.14) · Audience ❌F1.15+F1.17 · Knowledge 🟡(lista✅ E6.4, pastas/Add ❌F1.9) · Voz ❌F1.3 (key no `.env`) · Mente 3D ❌F1.18/F2.5.
> **Ordem sugerida:** F1.16 (shell) → F1.12 (train) → F1.13 (conversations) → F1.9 (add knowledge) → F1.3 (voz) → F1.17 (acesso) → F1.14/F1.18.

## FASE 1.5 — Camada de fidelidade (knowledge graph) — ver doc 10
- [x] **F1.5.1** ✅ Extração de entidades/relações/princípios por LLM → `kg_entities`/`kg_relations` com `confidence` (migration 0006). `kg-extract` (LLM→JSON validado por Zod, captura princípios/heurísticas) + `kg-build` (upsert idempotente: unique índices + `onConflictDoNothing`, `source_chunk` p/ proveniência). Endpoints dono: `POST /:slug/kg/build` (inline, capado 60 chunks) + `GET /:slug/kg`. UI: toggle **Estrutura / Conhecimento** na Mente 3D + botão "Extrair grafo" (entidades coloridas por tipo, princípios em dourado, relações com seta/label). Testes: `kg.test.ts` (parse/validação + persistência + idempotência). **Provado no LLM real:** 5 trechos do Fausto → 43 entidades + 33 relações com princípios reais.
- [x] **F1.5.2** ✅ Recuperação híbrida++ (vetorial + sub-grafo) na orquestração. `retrieveSubgraph` combina **proveniência** (relações cujo `source_chunk` está nos hits recuperados) + **léxico** (entidades cujo nome aparece na pergunta + vizinhança), dedup + ordena por confiança, cap 12. Injetado no prompt como seção "PRINCÍPIOS E CONEXÕES (como você pensa)" — informa raciocínio/voz, fatos seguem citando TRECHOS [N]. Gate `graphRetrievalEnabled` (default on) em `ChatLimits`. Testes: `kg-retrieve.test.ts` (proveniência/léxico/vazio). **Provado no LLM real:** "stablecoins?" → 6 fatos injetados; resposta COM grafo conecta dívida-EUA→sangria de poupança→estratégia americana (raciocínio do Fausto), SEM grafo fica genérica.
- [x] **F1.5.3** ✅ Modo de extrapolação a partir de princípios. Quando o retrieval dá `no_context` mas o grafo tem ≥2 princípios/relações relevantes (léxico na pergunta), em vez de recusar, o clone responde inferindo (`buildExtrapolationArgs` → "MODO INFERÊNCIA": sem `[N]`, sem inventar fatos, marcado como leitura/inferência). Guardrail CVM continua valendo (regenera→resposta segura). Flag `extrapolated` ponta a ponta (chat→API→UI: aviso "💭 Inferência"). Testes: integração no `chat.test` (no_context + princípios → extrapolated). **Provado no LLM real:** "stablecoins vs ouro?" → "Não falei disso diretamente, mas pelo meu jeito de pensar..." derivando dos princípios do Fausto.
- [x] **F1.5.4** ✅ Slider de leniência (quanto o clone pode extrapolar); registrar nível em `messages`. Coluna `creators.leniency` (`strict`|`balanced`|`open`, default balanced; migration 0007) + `messages.leniency` (auditoria por turno). `minFactsToExtrapolate`: strict=nunca, balanced=≥2 fatos, open=≥1. Endpoints dono `GET|PUT /:slug/leniency`; controle segmentado na Persona do Studio ("Liberdade de inferência"). Testes: gate na integração do `chat.test` (strict recusa, open infere com 1 fato).
- [x] **F1.5.5** ✅ (Opcional) Dimensão temporal do grafo (`valid_from`/`valid_to`). Extração captura `year` quando a relação é datada → `valid_from`; `getKnowledgeGraph`/`retrieveSubgraph` retornam o ano; exibido na Mente 3D (label da relação + painel de detalhe) e injetado no prompt (`X relaciona Y (2022)`). Teste: `kg.test` (relação datada → `year`). *Time-travel queries ("meu eu de 2020") ficam para F2 — a base temporal está pronta.*

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
