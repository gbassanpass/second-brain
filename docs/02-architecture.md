# 02 — Arquitetura

## Visão de blocos

```
┌─────────────────────────────────────────────────────────────┐
│ INGESTÃO (workers assíncronos)                                │
│  conectores: Instagram Graph API · YouTube Data API · upload  │
│  → baixar mídia própria → transcrição (Deepgram/AssemblyAI)   │
│  → normalizar (texto + metadados + timestamps + fonte)        │
└───────────────────────────┬───────────────────────────────────┘
                            │
┌───────────────────────────▼───────────────────────────────────┐
│ SECOND BRAIN                                                    │
│  chunking → embeddings (OpenAI) → pgvector (por creator_id)     │
│  + índice de texto (tsvector/BM25) para busca híbrida           │
│  + Persona Card (gerada do conteúdo + entrevista do criador)    │
└───────────────────────────┬───────────────────────────────────┘
                            │
┌───────────────────────────▼───────────────────────────────────┐
│ ORQUESTRAÇÃO DE RESPOSTA (request síncrono)                     │
│  query → busca híbrida (vetorial + BM25, RRF) → rerank (Cohere) │
│  → top-5 → monta prompt (Persona Card + trechos + histórico)    │
│  → LLM (Claude Haiku/Sonnet, prompt caching)                    │
│  → GUARDRAILS (classificador investimento + filtro de tom)      │
│  → resposta (texto) [→ voz ElevenLabs na Fase 1]                │
└───────────────────────────┬───────────────────────────────────┘
                            │
┌───────────────────────────▼───────────────────────────────────┐
│ ENTREGA + NEGÓCIO                                               │
│  chat web (Next.js) · [WhatsApp/Telegram na Fase 1]             │
│  auth (Clerk) · paywall · billing webhook · analytics · logs    │
└─────────────────────────────────────────────────────────────────┘
```

## Componentes do backend
- `api/` — FastAPI: rotas HTTP (chat, ingest, auth callbacks, billing webhooks).
- `services/` — lógica de negócio (sem regra nos endpoints).
- `rag/` — retrieval híbrido, rerank, montagem de prompt, guardrails.
- `llm/`, `embeddings/`, `transcription/`, `voice/` — adaptadores de provedor (interface + implementação), trocáveis.
- `models/` — modelos SQLAlchemy + schemas Pydantic.
- `workers/` — jobs de ingestão e transcrição (fila).

## Fluxos principais
### Ingestão (assíncrona)
1. Criador conecta fonte (OAuth) ou faz upload.
2. Worker lista mídias → baixa as próprias → transcreve áudio/vídeo → gera `documents`.
3. Chunking → embeddings → grava `chunks` + vetores no pgvector + tsvector.
4. Marca a fonte como indexada; emite evento de progresso.

### Conversa (síncrona)
1. `POST /chat` com `creator_id`, `conversation_id`, mensagem.
2. Verifica acesso (assinante ativo) — senão paywall.
3. Busca híbrida → rerank → top-5 trechos.
4. Monta prompt com Persona Card (cacheada) + trechos + histórico curto.
5. Chama LLM; aplica guardrails antes e depois.
6. Persiste `message` (pergunta, trechos citados, resposta, modelo, tokens, custo).
7. Retorna resposta + fontes.

## Decisões de arquitetura (ADRs resumidos)
- **RAG, não fine-tuning:** atualização barata, citação de fonte, multi-tenant trivial. (Ver doc 05.)
- **RAG, não long-context:** precisa de atribuição de fonte e custo baixo; conteúdo muda toda semana.
- **pgvector no início:** um só datastore, consistência transacional, multi-tenant por `creator_id`. Migrar para Qdrant self-host quando o volume justificar.
- **Adaptadores de provedor:** nunca chamar SDK do provedor direto nos serviços — sempre via interface (`llm/base.py`, etc.) para trocar modelo/fornecedor sem refatorar.
- **Multi-tenant desde o dia 1 no schema** (mesmo com 1 criador).

## Não-funcionais
- Latência alvo de resposta de chat: < 4s (texto) no p50.
- Observabilidade: logar tokens, custo, latência, trechos recuperados por requisição.
- Idempotência na ingestão (reprocessar não duplica chunks — usar hash do conteúdo).
