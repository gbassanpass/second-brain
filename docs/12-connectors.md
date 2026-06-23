# 12 — Conectores de conteúdo

> Esta camada abstrai **de onde vem o conteúdo do criador**. O resto do pipeline (chunking, embeddings, indexação) é igual independente da origem.

## Interface

```ts
// backend/src/connectors/base.ts
export interface RawDocument {
  externalId: string;          // id estável na fonte (post id, video id, etc.)
  kind: 'reel' | 'video' | 'caption' | 'article' | 'transcript' | 'upload';
  title?: string;
  url?: string;
  rawText: string;             // texto normalizado (caption, transcript, etc.)
  mediaUrl?: string;           // URL/path no Supabase Storage se houver mídia bruta
  publishedAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface ContentConnector {
  readonly kind: 'manual' | 'phyllo' | string;
  list(creatorId: string): AsyncIterable<RawDocument>;
}
```

A camada `services/ingest` chama `connector.list(creatorId)` e empurra cada `RawDocument` para o pipeline padrão (hash → upsert em `documents` → enfileira chunking/embedding).

## MVP — `ManualUploadConnector`

- Lê `data/fausto/` recursivamente. Aceita `.md`, `.txt`, `.json` (com `title`/`rawText`/...), `.srt`/`.vtt` (legenda → texto).
- `externalId` = sha256 do path relativo; `content_hash` = sha256 do `rawText`.
- Não faz chamada externa; ideal para o MVP, para testes e para conteúdo que o criador subiu à mão.
- Acionado por `make ingest-fausto`.

## Fase 1 — `PhylloConnector`

[Phyllo](https://www.getphyllo.com/) é "Plaid para criadores": uma API unificada que conecta contas oficiais (Instagram, YouTube, TikTok, X, etc.) via OAuth e devolve conteúdo + métricas. Adotamos por dois motivos:

1. **Acelera Fase 1:** uma integração cobre N plataformas. Implementar Instagram Graph + YouTube Data + TikTok à mão consome 2–4 semanas (cada uma exige app review, refresh tokens, rate limits, paginação).
2. **Cumpre nossas regras inegociáveis:** Phyllo é fonte oficial via OAuth → conteúdo é do próprio criador (cobre "só de si mesmo"); permite verificação de identidade do criador (selo "mente oficial").

### Pré-requisitos
- Conta Business/Creator no Instagram (Fausto ✅).
- Conta Phyllo (sandbox primeiro, depois produção).
- Webhook endpoint público (`POST /api/connectors/phyllo/webhook`) para receber notificação de novo conteúdo.

### O que Phyllo entrega
- Posts/vídeos com `id`, `title`, `description`, `caption`, `published_at`, `media_url`.
- Métricas de audiência (úteis para analytics e Persona Card).
- Webhooks `content.created` / `content.updated` → ingestão automática sem polling.
- Identity check do criador.

### O que Phyllo **não** entrega
- **Transcrição.** Reels e YouTube continuam passando pelo `Transcriber` (Deepgram/AssemblyAI) depois.
- **Persona Card.** Continua sendo gerada pelo nosso pipeline + interview mode (Fase 1.5).

### Fluxo
1. Criador autentica no Studio → frontend abre o Connect SDK do Phyllo → criador escolhe Instagram/YouTube/etc.
2. Backend recebe o `user_id` do Phyllo, salva em `content_sources.external_ref`.
3. Job inicial roda `phylloConnector.list(creatorId)` para puxar o backlog → cada `RawDocument` vira `document` → pipeline normal.
4. Webhook `content.created` enfileira ingestão incremental.
5. Status em `content_sources` (`pending → indexing → indexed`).

### Custos
- Assinatura B2B Phyllo (não publicaram tier free no momento desta escrita — verificar em sales). Modelado: faz sentido a partir de 3+ criadores, ou um único criador com volume alto de publicação.

## O que NÃO fazer
- **Não raspar conteúdo de terceiros.** Regra inegociável do CLAUDE.md. Mesmo que tecnicamente possível, viola consentimento e a política da Delphi que adotamos.
- **Não chamar o SDK do Phyllo direto em `services/` ou em rotas.** Sempre via `ContentConnector`. Trocar Phyllo por integração direta no futuro = adicionar outro adapter, não refatorar.
- **Não confiar no Phyllo para guardrails de consentimento.** Mesmo com OAuth, registrar `consents.content = granted` no Studio antes de habilitar a fonte.

## Roadmap dessa camada
- **E0.4 (MVP):** interface `ContentConnector` + `ManualUploadConnector`.
- **F1.1:** `PhylloConnector` + webhook + flow no Studio.
- **F2+:** considerar adapter direto (Instagram Graph API próprio) se o volume justificar economia vs. Phyllo.
