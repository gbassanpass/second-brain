# 05 — Pipeline RAG, Persona Card e Guardrails

> Este doc cobre o RAG do MVP. A camada de fidelidade superior (knowledge graph, pesos de confiança, extrapolação por princípios, interview mode) — que é o que a Delphi faz a mais — está em `10-knowledge-graph-and-fidelity.md`, e entra só na Fase 1.5+.

## Por que RAG (e não fine-tuning / long-context)
- **Não fine-tuning:** caro, desatualiza quando o criador posta, recall pior, não escala multi-tenant. Estilo/voz se resolve com prompt + few-shot.
- **Não long-context:** precisamos citar fonte (anti-alucinação) e custo baixo; conteúdo muda toda semana. RAG vence para recuperação factual com atribuição.

## Pipeline de ingestão
1. **Coleta:** API oficial (Instagram Graph, YouTube Data) lista mídias do criador; ou upload. Só conteúdo do próprio criador (checar `consents.content`).
2. **Transcrição:** áudio/vídeo → texto (Deepgram/AssemblyAI), idioma pt-BR, com timestamps.
3. **Normalização:** gera `documents` (raw_text + metadados + content_hash).
4. **Chunking:** ~300–500 tokens por chunk, com sobreposição de ~15%. Respeitar limites de fala/parágrafo.
5. **Embeddings:** `text-embedding-3-small` por chunk → `chunks.embedding`.
6. **Índice textual:** `to_tsvector('portuguese', text)` → `chunks.tsv`.
7. **Clusterização (opcional, p/ mind viz):** rotular `chunks.topic`.

## Pipeline de resposta (retrieval → geração)
1. **Busca híbrida:** 
   - vetorial: `ORDER BY embedding <=> query_embedding LIMIT 50` (cosine);
   - textual: `ts_rank` sobre `tsv` com `plainto_tsquery('portuguese', query)`;
   - combinar por **RRF (Reciprocal Rank Fusion)** → ~top-50.
2. **Rerank:** Cohere Rerank 3.5 sobre os 50 → manter **top-5**.
3. **Montagem do prompt:** Persona Card (cacheada) + 5 trechos (com fonte) + histórico curto (últimas ~6 mensagens) + pergunta.
4. **LLM:** Claude Haiku por padrão; rotear para Sonnet se a pergunta for marcada como complexa (heurística: tamanho, múltiplas sub-perguntas, baixa confiança do retrieval).
5. **Guardrails** (antes e depois — ver abaixo).
6. **Pós:** persistir `message` com trechos citados, tokens, custo, latência, flag.

## Persona Card (JSON em `creators.persona_card`)
Gerada na ingestão (resumo do conteúdo) + entrevista do criador. Exemplo (Fausto):
```json
{
  "name": "Fausto Bassan",
  "one_liner": "Explico o mundo sem torcer — política, ciência e fé.",
  "voice": ["didático", "direto", "neutro/sem militância", "usa analogias", "fé como base de valores"],
  "frameworks": ["mostrar os interesses de cada lado", "quem ganha o quê", "fatos vs narrativa"],
  "do": ["explicar acontecimentos sem viés", "apoiar decisões de vida", "refletir sobre fé e razão"],
  "dont": ["recomendar compra/venda de ativos", "tomar lado partidário", "prometer ganho financeiro"],
  "catchphrases": ["sem torcer", "antes de escolher um vilão, pergunte quem ganha o quê"],
  "disclaimer": "Conteúdo educativo; não é recomendação de investimento."
}
```
Use o bloco `do`/`dont`/`voice` no system prompt. Cacheie esse system prompt (prompt caching) — ele é fixo por criador.

## System prompt (template)
```
Você é o assistente que fala no estilo de {name}: {one_liner}.
Estilo: {voice}. Use estes frameworks ao explicar: {frameworks}.
Você PODE: {do}. Você NÃO PODE: {dont}.
Responda só com base nos TRECHOS fornecidos. Se não houver base, diga que não tem isso registrado.
Cite a fonte quando afirmar fatos. {disclaimer}
TRECHOS:\n{retrieved_chunks}
```

## Guardrails (OBRIGATÓRIO)
### 1. Anti-recomendação de investimento (CVM)
- **Detecção (pré):** classificador leve (regras + um classificador LLM barato) sobre a pergunta. Sinais: "qual ação/cripto comprar", "onde investir", "vale a pena comprar X", "quanto alocar".
- **Ação:** se detectado, forçar **modo educacional**: o clone explica conceitos/cenário, mostra as perguntas que a pessoa deveria se fazer, e adiciona disclaimer. Nunca dá recomendação personalizada.
- **Pós-geração:** filtro que rejeita/edita respostas contendo recomendação direta ("compre", "venda", "aloque X%"). Se a resposta violar, regenerar com instrução reforçada ou retornar a versão educacional.
- **Registro:** `messages.guardrail_flag = 'investment'`.

### 2. Segurança / fora de escopo
- Conteúdo perigoso, médico/jurídico personalizado, ou difamação de pessoa real → recusar educadamente e redirecionar.
- Tom: manter neutralidade ("sem torcer"); não assumir posição partidária.

### 3. Anti-alucinação
- Se os top-5 trechos têm score de rerank abaixo do limiar, responder "não tenho isso registrado nos conteúdos do {name}" em vez de inventar.

## Avaliação (harness — ver backlog E4)
- `eval/golden.yaml`: ~30 perguntas com resposta esperada e categoria (geopolítica, fé, decisão de vida, **investimento → deve disparar guardrail**).
- Métricas: acerto factual, "soa como o criador" (avaliador LLM), taxa de disparo correto do guardrail, custo médio por resposta.
- Rodar a cada mudança no pipeline; bloquear regressões.
