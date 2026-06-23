# Delphi BR — Pacote de especificações

Specs para construir uma plataforma de clones de criadores (estilo Delphi.ai) focada no Brasil. Primeiro cliente: Fausto Bassan.

## Como usar com o Claude Code

1. Crie um repositório git vazio e copie esta pasta inteira para a raiz (o `CLAUDE.md` fica na raiz; o resto em `docs/`).
2. Abra o repositório no Claude Code.
3. Diga: *"Leia o CLAUDE.md e todos os docs/. Comece o Épico E0 do backlog (scaffolding) e siga em ordem, parando ao fim de cada épico para revisão."*
4. Revise cada épico antes de liberar o próximo.

## Mapa dos documentos

| Arquivo | Conteúdo |
|---|---|
| `CLAUDE.md` | Instruções-mestre para o Claude Code (ler primeiro) |
| `docs/01-product-spec.md` | Visão, escopo, MVP, personas, monetização |
| `docs/02-architecture.md` | Arquitetura do sistema e fluxo de dados |
| `docs/03-tech-stack.md` | Stack exata, escolhas e custos |
| `docs/04-data-model.md` | Schema PostgreSQL + pgvector |
| `docs/05-rag-and-guardrails.md` | Pipeline RAG, Persona Card, guardrails CVM |
| `docs/06-api-and-frontend.md` | Endpoints da API e telas do frontend |
| `docs/07-roadmap-backlog.md` | Épicos → tarefas com critérios de aceite (o que o Claude Code executa) |
| `docs/08-setup-and-env.md` | Setup local, variáveis de ambiente, comandos |
| `docs/09-mind-visualization.md` | Visualização 3D da "mente" + script Python de referência |
| `docs/10-knowledge-graph-and-fidelity.md` | Camada de fidelidade (knowledge graph, confiança, interview mode) — Fase 1.5+ |
| `docs/11-ui-design.md` | UI/design estilo ChatGPT (layout, componentes, tokens) |
| `clone-fausto-chatgpt-style.html` | Protótipo navegável da interface (estilo ChatGPT) |

## Aviso

As recomendações de produto, custo e arquitetura refletem o mercado de jun/2026 e podem mudar. Os pontos sobre CVM, consentimento e termos de plataforma são alertas técnicos — valide com um profissional jurídico antes de comercializar.
