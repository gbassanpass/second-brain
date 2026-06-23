# 06 — API e Frontend

## API (FastAPI) — endpoints do MVP

### Chat
- `POST /api/chat`
  - body: `{ creator_slug, conversation_id?, message }`
  - auth: requer usuário logado **e** acesso (assinatura ativa OU criador/operador).
  - resp: `{ conversation_id, reply, sources: [{title,url,chunk_id}], guardrail_flag }`
  - efeitos: roda pipeline RAG (doc 05), persiste `messages`.
- `GET /api/conversations/{id}` — histórico da conversa (do dono).

### Ingestão (criador/operador)
- `POST /api/creators/{slug}/sources` — registra fonte (instagram|youtube|upload|text).
- `POST /api/creators/{slug}/sources/{id}/sync` — dispara worker de ingestão (assíncrono).
- `GET /api/creators/{slug}/sources` — status de indexação.
- `POST /api/creators/{slug}/documents` — upload de texto/arquivo manual (MVP usa muito isso).

### Persona
- `GET/PUT /api/creators/{slug}/persona` — lê/edita a Persona Card (JSON do doc 05).

### Billing (webhook)
- `POST /api/billing/webhook` — recebe eventos do provedor (Stripe/Hotmart/Kiwify), cria/atualiza `subscriptions`. Idempotente por `external_id`.

### Auth
- Callbacks do Clerk; middleware injeta `user` e resolve `role`.

### Admin/analytics
- `GET /api/creators/{slug}/analytics` — nº de conversas, custo total, perguntas top, taxa de guardrail.

## Regras de acesso (paywall)
Middleware `require_access(creator_slug)`:
1. Usuário autenticado? senão 401.
2. É criador/operador desse criador? libera.
3. Tem `subscription` ativa para esse criador? libera.
4. Senão → 402 + payload de paywall (link de checkout).

## Frontend (Next.js 14) — telas do MVP
> Estilo visual: layout conversacional **estilo ChatGPT** (sidebar de conversas + coluna central + input fixo). Spec detalhada e protótipo em `docs/11-ui-design.md` / `clone-fausto-chatgpt-style.html`.
1. **Landing do clone** (`/c/[slug]`): apresentação do clone, exemplos de pergunta, CTA assinar. Disclaimer visível.
2. **Chat** (`/c/[slug]/chat`): interface de conversa (estilo do protótipo `clone-fausto-prototipo.html`), chips de sugestão, exibição de fontes, badge do guardrail quando aplicável, disclaimer no rodapé. Bloqueado por paywall.
3. **Checkout/paywall:** redireciona para o provedor de pagamento; ao voltar, valida assinatura.
4. **Painel do criador** (`/studio`): conectar fontes, ver status de indexação, editar Persona Card, ver analytics, "testar o clone".
5. **(Pós-MVP)** Mind Visualization (`/c/[slug]/mind`) — ver doc 09.

## Componentes-chave
- `ChatWindow` (mensagens, streaming de resposta, fontes).
- `SourceList` / `SourceConnect` (ingestão).
- `PersonaEditor` (form do JSON da Persona Card).
- `AnalyticsCards` (métricas do doc 01).

## UX obrigatória
- Disclaimer educacional sempre visível no chat.
- Quando o guardrail de investimento dispara, a UI mostra o aviso (sem parecer erro).
- Mostrar as **fontes** (de qual conteúdo veio a resposta) — reforça confiança e diferencia.
