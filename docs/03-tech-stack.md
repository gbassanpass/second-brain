# 03 — Stack técnica e custos

## Decisões (com versões alvo)
| Camada | Escolha | Notas |
|---|---|---|
| Linguagem backend | **Node 20 + TypeScript** | `strict` obrigatório, sem `any` |
| Framework backend | **Hono** | router HTTP leve, edge-friendly; rotas em `backend/src/api/` |
| Validação | **Zod** | schemas em toda fronteira (HTTP, env, provedor, webhook) |
| ORM / queries | **Drizzle ORM** | suporte nativo a `pgvector` (coluna `vector`, operadores `<=>`); SQL puro para busca híbrida/RRF |
| Migrations | **Drizzle Kit** | gera SQL; aplicadas via `DATABASE_URL_DIRECT` (não pelo pooler) |
| Fila / workers | **BullMQ + Redis** | ingestão e transcrição assíncronas; worker é processo Node separado |
| DB | **Supabase Postgres 17 + pgvector** | gerenciado; dev local via `supabase start` |
| Storage | **Supabase Storage** | uploads de áudio/vídeo/PDF do criador (bucket por `creator_id`) |
| Auth | **Supabase Auth** | e-mail/magic link, OAuth Google/Apple; sessão JWT validada no Hono |
| LLM | Anthropic Claude | `claude-haiku` default, `claude-sonnet` fallback; prompt caching |
| Embeddings | OpenAI `text-embedding-3-small` (1536-d) | validar PT; alternativa Cohere Embed 4 / Voyage |
| Reranker | Cohere Rerank 3.5 | multilíngue, ótimo PT |
| Transcrição | Deepgram Nova-3 ou AssemblyAI | PT suportado; Whisper self-host no volume |
| Voz (Fase 1) | ElevenLabs (PVC) | Cartesia como alternativa de custo |
| Conectores de conteúdo | `ManualUploadConnector` (MVP) → **Phyllo** (F1.1) | ver `docs/12-connectors.md` |
| Frontend | Next.js 14 (App Router) + TS + Tailwind | |
| Billing | Stripe (código) + webhook; Hotmart/Kiwify na operação BR | |
| Infra dev | **Supabase CLI** + `docker-compose` para Redis | sem Kubernetes |
| Infra prod | Supabase + PaaS (Railway/Render/Fly) para API e workers | |
| Lint/format | **Biome** | substitui ESLint + Prettier no monorepo |
| Testes | **Vitest** (backend e frontend) + Playwright (e2e opcional) | |
| Package manager | **pnpm workspaces** | monorepo `/backend`, `/frontend` |

## Camada de abstração de provedores (obrigatória)
Defina interfaces TS e implemente adaptadores. **Nunca chame o SDK do provedor direto nos `services/`.** Cada interface tem implementação real + um fake para testes.

```
backend/src/llm/base.ts           -> interface LLMClient { complete(args): Promise<LLMResult> }
backend/src/llm/anthropic.ts      -> implementação Claude (com prompt caching)
backend/src/llm/fake.ts           -> fake para testes
backend/src/embeddings/base.ts    -> interface Embedder { embed(texts): Promise<number[][]> }
backend/src/embeddings/openai.ts
backend/src/rerank/base.ts        -> interface Reranker { rerank(query, docs, topK): Promise<Scored[]> }
backend/src/rerank/cohere.ts
backend/src/transcription/base.ts -> interface Transcriber { transcribe(audio): Promise<Transcript> }
backend/src/transcription/deepgram.ts
backend/src/voice/base.ts         -> interface VoiceSynth { speak(text, voiceId): Promise<AudioStream> }   # Fase 1
backend/src/connectors/base.ts    -> interface ContentConnector { list(): AsyncIterable<RawDocument> }
backend/src/connectors/manual.ts  -> lê data/fausto/ (MVP)
backend/src/connectors/phyllo.ts  -> Fase 1 (ver doc 12)
```

Os adapters são selecionados por factory a partir de env (`LLM_PROVIDER=anthropic`, `EMBEDDINGS_PROVIDER=openai`, etc.). Trocar provedor = trocar env + adicionar implementação.

## Custos de referência (jun/2026 — ordem de grandeza)
**LLM por 1M tokens (entrada/saída):** Claude Haiku $0,25/$1,25 · Sonnet $3/$15 · Opus $5/$25. Gemini 3 Flash $0,50/$3 (alternativa barata).
**Embeddings por 1M tokens:** OpenAI 3-small $0,02 · Google 005 $0,006 · Cohere Embed 4 $0,12.
**Transcrição por minuto:** AssemblyAI ~$0,0025 · Deepgram ~$0,0043 · Whisper API ~$0,003–0,006.
**Voz por 1M chars:** ElevenLabs ~$66 · Cartesia ~$50.
**Vector DB/mês:** pgvector no Supabase ~grátis no MVP (Free tier comporta o Fausto); migrar para Qdrant self-host quando o volume justificar.
**Supabase:** Free tier (500 MB DB, 1 GB Storage, 50k MAU Auth) atende o MVP; Pro ~$25/mês ao escalar.

### Custo modelado
- Conversa só-texto (~6 trocas) com Haiku: **~US$0,01**; com Sonnet: ~US$0,09.
- Com voz (ElevenLabs): +~US$0,79/conversa → **voz é o maior custo; gate atrás do Pro.**
- Indexar todo o Fausto (embeddings + transcrição): **centavos a ~US$2**, uma vez.

## Alavancas de economia (implementar)
1. Roteamento por complexidade: Haiku no grosso, Sonnet só no difícil.
2. Prompt caching da Persona Card e instruções fixas (−40% a −90% da entrada).
3. Retrieval enxuto (top-5 após rerank) reduz tokens de entrada.
4. Voz sob demanda / só no Pro / Cartesia ao escalar.
5. Cache de respostas para perguntas frequentes.
