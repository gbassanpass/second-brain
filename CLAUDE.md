# CLAUDE.md — Instruções do projeto para o Claude Code

> Este arquivo é lido automaticamente pelo Claude Code. Ele define o que estamos construindo, como construir, e as regras inegociáveis. **Leia também todos os arquivos em `docs/` antes de começar qualquer tarefa.**

## O que estamos construindo

Uma plataforma SaaS de "clones de criadores" (estilo Delphi.ai), focada no mercado brasileiro. Um criador conecta seu conteúdo (Instagram, YouTube, textos), e a plataforma cria um assistente de IA que conversa com a audiência no estilo dele, por texto (e voz depois). Primeiro cliente: **Fausto Bassan** (nicho: geopolítica/atualidade "sem torcer", fé, empreendedorismo).

Não é fine-tuning de modelo. É **RAG** (retrieval-augmented generation) + prompt de persona sobre um LLM via API. Veja `docs/05-rag-and-guardrails.md`. Na Fase 1.5+, a fidelidade sobe com uma camada de **knowledge graph + pesos de confiança + interview mode** (como a Delphi faz) — ver `docs/10-knowledge-graph-and-fidelity.md`. Mas o MVP é RAG puro; não construir o grafo cedo.

## Ordem de construção (NÃO pule fases)

1. **Fase 0 — MVP single-tenant para o Fausto.** Objetivo: clone de texto funcionando, com paywall, que gera receita. Escopo travado em `docs/07-roadmap-backlog.md` (Épicos E1–E6).
2. **Fase 1 — Produtizar** para 1–3 criadores (onboarding semi-automático, voz, consentimento).
3. **Fase 2 — SaaS self-service multi-tenant.**

**Regra de ouro:** mesmo na Fase 0 com um único criador, todo o modelo de dados e as queries já usam `creator_id`. Nunca escreva código que assuma um único criador hardcoded. Isso evita reescrita na Fase 2.

## Stack (resumo — detalhes em docs/03-tech-stack.md)

- **Backend:** Node 20 + TypeScript + **Hono**. Validação com **Zod**. Jobs assíncronos com **BullMQ + Redis**.
- **DB + Auth + Storage:** **Supabase** (Postgres 17 + extensão `pgvector` + Supabase Auth + Supabase Storage). Migrations com **Drizzle Kit** (SQL puro); dev local via **Supabase CLI** (`supabase start`).
- **ORM/queries:** **Drizzle ORM** (suporte nativo a `pgvector`, queries tipadas, raw SQL quando precisar — ex.: RRF na busca híbrida).
- **LLM:** Claude (Anthropic API). Default `claude-haiku`, fallback `claude-sonnet` para perguntas complexas. Camada de abstração `llm/` para permitir trocar provedor.
- **Embeddings:** OpenAI `text-embedding-3-small` (abstrair em `embeddings/`).
- **Reranker:** Cohere Rerank 3.5 (abstrair em `rerank/`).
- **Transcrição:** Deepgram ou AssemblyAI (abstrair em `transcription/`).
- **Voz (Fase 1):** ElevenLabs (abstrair em `voice/`).
- **Conectores de conteúdo:** interface `ContentConnector` em `connectors/`. MVP usa `ManualUploadConnector` (lê `data/fausto/`); Phyllo é o adapter alvo da Fase 1 — ver `docs/12-connectors.md`.
- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind.
- **Auth + Billing:** **Supabase Auth** (e-mail/magic link, OAuth Google/Apple) + checkout recorrente (Stripe no código; Hotmart/Kiwify via webhook na operação BR).

## Regras inegociáveis

1. **Guardrail anti-recomendação de investimento (CVM):** o clone NUNCA dá recomendação personalizada de compra/venda de ativos. Toda resposta que tangencie investimento entra no modo educacional + disclaimer. Implementação obrigatória — ver `docs/05-rag-and-guardrails.md §Guardrails`. Não considere uma feature opcional.
2. **Sempre cite a fonte** do trecho recuperado quando fizer afirmação factual; se o retrieval não trouxer contexto suficiente, o clone responde "não tenho isso registrado" em vez de inventar.
3. **Consentimento + "só de si mesmo":** só ingerir conteúdo do próprio criador, mediante registro de consentimento (tabela `consents`). Um usuário só pode criar um clone de si mesmo (regra de autenticidade da Delphi). Nunca raspar conteúdo de terceiros. Verificar identidade do criador (selo "mente oficial").
6. **Não enganar:** deixar sempre explícito ao usuário que ele conversa com a "mente digital" do criador, não com a pessoa real.
7. **Política de uso:** sem clones de políticos e sem conteúdo adulto.
4. **Segredos** só via variáveis de ambiente (`.env`, nunca commitado). Ver `docs/08-setup-and-env.md`.
5. **Custo:** prefira `claude-haiku` + prompt caching da persona. Só escale para `sonnet` por roteamento de complexidade. Logue tokens por requisição.

## Convenções de código

- **TypeScript em todo o backend e frontend:** `strict` ligado, sem `any`, sem `as` para silenciar erros. Funções puras quando possível, sem lógica de negócio nos route handlers (use camada `services/`).
- **Lint/format:** **Biome** (substitui ESLint + Prettier no monorepo). Frontend pode adicionar plugins React-específicos se necessário.
- **Validação de fronteira:** todo input externo (HTTP body, env, payload de provedor, webhook) passa por um schema **Zod** antes de virar tipo interno.
- **Testes:** **Vitest** para backend e frontend. Cada serviço tem testes; testes de RAG ficam no harness do E4 (golden questions). Adapters de provedor têm implementação real + fake para testes.
- **Sem SDK de provedor fora do adapter:** services chamam só a interface (`LLMClient`, `Embedder`, `Reranker`, `Transcriber`, `ContentConnector`). Trocar provedor = trocar 1 factory.
- **Commits pequenos e por tarefa do backlog.** Cada tarefa do backlog vira um PR.
- **Log obrigatório de toda conversa** (pergunta, trechos recuperados, resposta, modelo, tokens, custo, latência, guardrail_flag) na tabela `messages` desde o primeiro dia.

## Como trabalhar neste repo

1. Leia `docs/` inteiro.
2. Pegue a próxima tarefa não concluída em `docs/07-roadmap-backlog.md` (ordem dos épicos).
3. Implemente, escreva testes, rode `pnpm test` e `pnpm lint` (ou `make test`/`make lint`, que são wrappers).
4. Atualize o checkbox da tarefa no backlog.
5. Pare e peça revisão ao fim de cada épico.

## Estrutura de pastas alvo

```
/backend      Hono app (src/api/, services/, rag/, llm/, embeddings/, rerank/, transcription/, voice/, connectors/, db/, workers/)
/frontend     Next.js 14 app (App Router + Tailwind)
/docs         estas specs
/infra        supabase/ (config, migrations geradas pelo Drizzle), scripts, docker-compose para Redis local
/eval         golden questions e harness de avaliação do RAG (Vitest)
/data/fausto  conteúdo bruto do Fausto para ingestão semi-manual (MVP)
```

Monorepo gerenciado com **pnpm workspaces**. Um Makefile fino expõe os comandos do dia a dia (`make up`, `make migrate`, `make dev`, `make test`, `make lint`, `make eval`, `make ingest-fausto`) chamando `pnpm` e `supabase` por baixo.
