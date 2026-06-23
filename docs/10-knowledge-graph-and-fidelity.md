# 10 — Camada de fidelidade: knowledge graph, confiança e interview mode

> Baseado na entrevista do CEO da Delphi (Dara Ladjevardian, Sequoia "Training Data"). O que a Delphi faz a mais que RAG vanilla — e como incorporar de forma incremental. **Importante:** o próprio CEO afirma que NÃO há moat técnico; o defensável é marca, confiança, autenticidade verificada e distribuição. Nossa tese (BR + monetização + conformidade) segue válida. Esta camada é para **qualidade/fidelidade do clone**, não para "tecnologia secreta".

## O que a Delphi descreve (confirmado)
Inspirada em *How to Create a Mind* (Kurzweil) — mente como hierarquia de reconhecedores de padrões. Eles construíram um **adaptive temporal knowledge graph** ("Clone Brain") que captura não só o que a pessoa sabe, mas **como ela raciocina**, com três propriedades além do RAG por similaridade:

1. **Relações estruturadas** — conexões entre eventos, heurísticas e princípios de raciocínio (não só trechos soltos).
2. **Pesos de confiança** — cada "fato" tem uma probabilidade de "quão provável é que essa pessoa realmente diria isso"; o usuário regula a leniência.
3. **Dimensão temporal** — o grafo muda no tempo ("o que meu eu de 23 anos diria sobre isto?").

Mais: **modo de extrapolação** (responder situação inédita a partir dos princípios estruturados — ex.: o avô nunca falou de IA, mas seus princípios sobre incerteza permitem inferir) e **interview mode** (poucas perguntas-chave geram um clone de alta fidelidade, reduzindo dependência de muito dado).

Na origem, ele cita literalmente "early GPT-3 + Hugging Face embeddings" — ou seja, começou como RAG clássico e evoluiu para o grafo. O LLM é de terceiros; o diferencial é a camada de ingestão/estruturação + guard-rails.

## Como incorporar (incremental — não atrase o MVP)
- **MVP (Fase 0):** continua **RAG vetorial + híbrido** (docs 02/05). Já entrega 80% do valor. NÃO construir grafo agora.
- **Fase 1.5:** adicionar a **camada de grafo (GraphRAG)** por cima do RAG — extração de entidades/relações/princípios + recuperação combinada (vetorial + grafo).
- **Fase 2:** pesos de confiança ajustáveis (slider de leniência), dimensão temporal, extrapolação refinada.

## Implementação da camada de grafo (GraphRAG)
1. **Extração:** um LLM lê cada `document`/`chunk` e extrai (a) entidades, (b) relações entre elas, (c) **princípios/heurísticas** do criador ("como ele decide diante de incerteza"). Salvar como triplas com `confidence`.
2. **Armazenamento:** começar no próprio Postgres (tabelas `kg_entities`, `kg_relations` — ver doc 04 §extensão). Migrar para um graph DB (Neo4j) só se a complexidade exigir.
3. **Recuperação híbrida++:** para a pergunta, combinar (a) top-k vetorial, (b) sub-grafo relevante (entidades da pergunta + vizinhança + princípios). Passar ambos ao LLM.
4. **Extrapolação:** quando o retrieval factual é fraco mas há princípios relevantes, instruir o LLM a responder **derivando dos princípios do criador**, marcando a resposta como inferida (não citação direta) e respeitando os guardrails.

## Pesos de confiança e "leniência"
- Cada fato/princípio tem `confidence ∈ [0,1]`.
- Parâmetro de **leniência** por criador/usuário: quão longe o clone pode extrapolar além do que foi dito explicitamente. Baixa leniência = só responde o que está bem suportado ("não tenho isso registrado"); alta = extrapola dos princípios (com aviso).
- Persistir o nível usado em `messages` para auditoria.

## Interview mode (alto ROI — antecipar para a Fase 1)
Fluxo de onboarding que faz ao criador um conjunto pequeno de perguntas direcionadas para preencher lacunas da Persona Card e dos princípios — em vez de depender só do conteúdo bruto. Aumenta muito a fidelidade com pouco esforço do criador.
- Gerar perguntas a partir das lacunas detectadas no grafo/persona ("você não fala muito sobre X — como você pensa sobre isso?").
- Respostas viram `documents` de alta confiança + atualizam a Persona Card.

## Princípios de produto do CEO (incorporar onde indicado)
- **Voz retém ~5x mais que texto** → priorizar voz no plano Pro mais cedo (doc 01/07).
- **Regra "só pode criar um clone de si mesmo"** → reforço de autenticidade + jurídico (CLAUDE.md, consents).
- **Sem políticos, sem conteúdo adulto/OnlyFans** → política de uso (doc 01).
- **Autenticidade verificada como marca/moat** → verificação de identidade do criador; selo de "mente oficial".
- **Mídia conversacional** (consumo migra de feed para conversa) → reforça a aposta no produto de chat/voz.
- **Não enganar:** deixar claro ao usuário que fala com a "mente digital", não com a pessoa.

## Conclusão honesta
Adotar o grafo melhora fidelidade e marketing ("modelamos como você pensa"), mas o CEO é explícito: o trunfo é **produto, confiança e distribuição**, não algoritmo. Faça o RAG bem no MVP, adicione o grafo quando a qualidade pedir, e invista o resto da energia em autenticidade verificada, onboarding (interview mode), voz e a camada BR de monetização/conformidade.
