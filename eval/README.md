# /eval — Avaliação do RAG

Harness de avaliação do clone (épico E4). Mantém as **golden questions** e o
script que mede:

- acerto factual
- "soa como o criador" (avaliador LLM)
- taxa de disparo correto do guardrail de investimento (BLOQUEANTE — E3)
- custo médio e latência por resposta

## Estrutura prevista (E4)

```
eval/
  golden.yaml              # ~30 perguntas com resposta esperada + categoria
  harness/                 # runner em TS chamando o pipeline do backend
  reports/                 # outputs versionados por commit
```

`make eval` roda o harness; CI falha em regressão abaixo do baseline (doc 01).

## Por que isso vive fora de `backend/`

O eval depende do pipeline de produção, mas roda como um app separado para
permitir comparar versões e ser invocado em CI sem subir o servidor HTTP.
