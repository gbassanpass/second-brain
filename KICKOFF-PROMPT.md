# Prompt de arranque para o Claude Code

Cole o texto abaixo na primeira mensagem do Claude Code, com este repositório aberto (CLAUDE.md na raiz, specs em `docs/`).

---

Você vai construir o produto descrito neste repositório. Antes de escrever qualquer código:

1. Leia o `CLAUDE.md` e TODOS os arquivos em `docs/` (01 a 10). Confirme em 5–10 linhas o que entendeu: objetivo, stack, regras inegociáveis e a ordem dos épicos.
2. Não comece a implementar até eu responder "ok".

Depois do meu "ok", trabalhe assim:

**Escopo desta rodada:** apenas a **Fase 0 — MVP**, executando os épicos do `docs/07-roadmap-backlog.md` **em ordem**: E0 → E1 → E2 → E3 → E4 → E5 → E6.

**NÃO construir agora** (deixe para depois, mesmo que sobre tempo): Fase 1, **Fase 1.5 (knowledge graph / interview mode / extrapolação)**, Fase 2, voz, conectores automáticos de Instagram/YouTube, mind visualization. Se achar que algo dessas fases é necessário, **pare e me pergunte** em vez de construir.

**Regras inegociáveis (do CLAUDE.md):**
- `creator_id` em todo o modelo de dados e queries, mesmo com um único criador.
- Nunca chamar SDK de provedor (LLM, embeddings, etc.) fora da camada de adaptadores.
- Guardrail anti-recomendação de investimento (E3) é **bloqueante**: não considere o MVP pronto sem E3 passando no eval (E4).
- Toda conversa logada em `messages` (tokens, custo, latência, fontes) desde o início.
- Só conteúdo do próprio criador; segredos só via `.env`.

**Cadência de trabalho:**
- Comece pelo E0 (scaffolding + infra). Ao terminar cada épico, rode `make test` e `make lint`, marque os checkboxes concluídos no `docs/07-roadmap-backlog.md`, faça um commit por tarefa, e **PARE para eu revisar** antes de iniciar o próximo épico. Me entregue um resumo curto do que foi feito e como testar.
- Cada tarefa deve ter testes. O RAG (E2/E3) deve ter o harness de avaliação do E4 com as golden questions.
- Se algo no spec estiver ambíguo ou faltando, pergunte antes de assumir — não invente requisito.

Comece confirmando seu entendimento (passo 1). Aguarde meu "ok".

---

## Dica de uso
- Revise mesmo ao fim de cada épico — não libere E1→E2 sem olhar o que saiu.
- Antes do E1, coloque o conteúdo do Fausto em `data/fausto/` (transcrições, legendas, textos) para a ingestão semi-manual.
- Tenha as API keys do `docs/08-setup-and-env.md` prontas antes do E2 (Anthropic, OpenAI, Cohere, Deepgram) e do E5 (Clerk, Stripe).
