# Second Brain — clones de criadores (BR)

Plataforma de "mentes digitais" de criadores (estilo Delphi.ai), focada no Brasil. Primeiro cliente: **Fausto Bassan**.

## Início rápido

- **Estado atual + como rodar:** [`PROGRESS.md`](PROGRESS.md) (snapshot do que já foi feito e o que vem a seguir).
- **Instruções para o Claude Code:** [`CLAUDE.md`](CLAUDE.md) (regras inegociáveis + convenções).
- **Backlog executável:** [`docs/07-roadmap-backlog.md`](docs/07-roadmap-backlog.md) (épicos com critérios de aceite).

```bash
pnpm install
pnpm lint && pnpm test && pnpm typecheck
pnpm --filter @second-brain/backend dev    # http://localhost:3001/api/health
pnpm --filter @second-brain/frontend dev   # http://localhost:3000
```

## Mapa dos documentos

| Arquivo | Conteúdo |
|---|---|
| `CLAUDE.md` | Instruções-mestre para o Claude Code (ler primeiro) |
| `PROGRESS.md` | Estado atual, próxima tarefa, como rodar, como retomar sessão |
| `docs/01-product-spec.md` | Visão, escopo, MVP, personas, monetização |
| `docs/02-architecture.md` | Arquitetura do sistema e fluxo de dados |
| `docs/03-tech-stack.md` | Stack exata, escolhas e custos |
| `docs/04-data-model.md` | Schema PostgreSQL + pgvector (no Supabase) |
| `docs/05-rag-and-guardrails.md` | Pipeline RAG, Persona Card, guardrails CVM |
| `docs/06-api-and-frontend.md` | Endpoints da API e telas do frontend |
| `docs/07-roadmap-backlog.md` | Épicos → tarefas com critérios de aceite (o que o Claude Code executa) |
| `docs/08-setup-and-env.md` | Setup local, variáveis de ambiente, comandos |
| `docs/09-mind-visualization.md` | Visualização 3D da "mente" + script de referência |
| `docs/10-knowledge-graph-and-fidelity.md` | Camada de fidelidade (knowledge graph, confiança, interview mode) — Fase 1.5+ |
| `docs/11-ui-design.md` | UI/design estilo ChatGPT (layout, componentes, tokens) |
| `docs/12-connectors.md` | Camada de conectores: `ManualUpload` (MVP) → Phyllo (F1.1) |
| `clone-fausto-chatgpt-style.html` | Protótipo navegável da interface (estilo ChatGPT) |

## Aviso

As recomendações de produto, custo e arquitetura refletem o mercado de jun/2026 e podem mudar. Os pontos sobre CVM, consentimento e termos de plataforma são alertas técnicos — valide com um profissional jurídico antes de comercializar.
