# 11 — UI / Design (estilo ChatGPT)

> Referência visual: layout conversacional estilo ChatGPT. Protótipo navegável: `clone-fausto-chatgpt-style.html` (na pasta de entregas). Stack: Next.js 14 + Tailwind. Suportar light/dark.

## Princípios
- Familiar e limpo (estilo ChatGPT): sidebar de conversas + coluna central de chat + input fixo embaixo.
- Conteúdo legível: coluna de leitura com largura máxima (~768px), centralizada.
- A marca do criador entra com sutileza (cor de acento + avatar + nome), sem poluir.
- Disclaimer e fontes sempre visíveis, mas discretos.

## Estrutura de tela (`/c/[slug]/chat`)
```
┌───────────┬───────────────────────────────────────────────┐
│ SIDEBAR   │  TOPBAR: avatar + "Fausto · mente digital"      │
│ (260px)   ├───────────────────────────────────────────────┤
│           │                                                 │
│ + Nova    │     [coluna central, max-width 768px]           │
│ conversa  │                                                 │
│           │     mensagens (assistant à esquerda c/ avatar,  │
│ histórico │      user à direita, fundo sutil)               │
│ de convs  │     fontes (chips) sob respostas factuais       │
│           │                                                 │
│ ───────   │                                                 │
│ perfil/   ├───────────────────────────────────────────────┤
│ assinante │  INPUT: caixa arredondada + botão enviar        │
│           │  disclaimer pequeno embaixo                     │
└───────────┴───────────────────────────────────────────────┘
```
- **Mobile:** sidebar vira drawer (ícone de menu na topbar); chat ocupa a tela toda.

## Componentes
- `Sidebar`: botão "Nova conversa" (destaque), lista de conversas (título = 1ª pergunta truncada), rodapé com avatar do criador + estado da assinatura.
- `TopBar`: avatar + nome + tag "mente digital" (cumpre a regra de não enganar). Botão de tema (claro/escuro). Menu (mobile).
- `MessageList`: linhas alternadas.
  - Assistant: avatar circular (iniciais/logo do criador) + bolha clara; markdown renderizado; abaixo, `Sources` (chips clicáveis "de: <título do conteúdo>").
  - User: alinhado à direita, fundo levemente destacado, sem avatar.
- `GuardrailNotice`: quando `guardrail_flag='investment'`, um aviso discreto (não vermelho de erro) acima/junto da resposta.
- `Composer`: textarea auto-expansível dentro de uma caixa arredondada (radius grande), botão de enviar (seta) à direita; Enter envia, Shift+Enter quebra linha; estado "pensando" com 3 pontinhos.
- `EmptyState`: saudação + 3–4 cartões de sugestão (ex.: "Me explica EUA × Irã sem torcer", "Faculdade vale a pena na era da IA?", "Estou numa decisão difícil"). Clicar preenche e envia.
- `Paywall`: se sem assinatura, mostra a landing/oferta no lugar do composer.

## Tokens de design (Tailwind)
- **Largura de leitura:** `max-w-3xl mx-auto` na coluna de mensagens e no composer.
- **Tema escuro (default, estilo ChatGPT):** fundo principal `#212121`/`#1e1e1e`, sidebar `#171717`, bolha assistant `#2a2a2a`, texto `#ececec`, borda `#333`.
- **Tema claro:** fundo `#ffffff`, sidebar `#f7f7f8`, bolha assistant `#f4f4f4`, texto `#1a1a1a`.
- **Acento do criador:** variável `--accent` por criador (Fausto: azul-marinho `#0f2540` + dourado `#c8a24a`). Usar no botão enviar, avatar, foco.
- **Tipografia:** system sans; mensagens 15–16px, line-height 1.6.
- **Raios:** input e cartões `rounded-2xl`; bolhas `rounded-xl`.
- **Espaçamento:** generoso entre mensagens (24px), padding do composer 12–16px.

## Comportamento
- **Streaming:** resposta aparece token a token (efeito de digitação). Mostrar indicador "pensando" antes do 1º token.
- **Markdown:** negrito, listas, links nas respostas do assistant.
- **Fontes:** sempre que houver trechos citados, listar como chips clicáveis que abrem o conteúdo original.
- **Acessibilidade:** contraste AA, navegação por teclado, `aria-label` nos botões de ícone.
- **Persistência:** conversas salvas por usuário (tabela `conversations`/`messages`).

## O que NÃO copiar do ChatGPT
- Não imitar logos/marca da OpenAI. É o clone do criador — a identidade visual é do criador.
- Sem recursos que confundam (ex.: dar a entender que é a OpenAI ou a pessoa real). Manter a tag "mente digital".
