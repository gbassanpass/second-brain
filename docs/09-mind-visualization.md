# 09 — Mind Visualization (pós-MVP)

> Visualização 3D da "mente" do criador (estilo Delphi). É feature de **vitrine/onboarding/compartilhamento**, NÃO melhora a qualidade do clone. Construir só na Fase 2. Reaproveita os embeddings que o RAG já gera.

## Como funciona
1. Cada ponto = um `chunk` (já existe no DB, com `embedding`).
2. Projetar os embeddings (1536-d) em **3D com UMAP** → pontos próximos = conteúdo semanticamente parecido (forma os clusters).
3. **Arestas** = vizinhos mais próximos por similaridade de cosseno (kNN) — opcionalmente um grafo de conhecimento (LLM extrai entidades/relações).
4. **Cores** = clusters/temas (HDBSCAN ou k-means) → grava em `chunks.topic`.
5. **Render** no navegador: Three.js (ver protótipo `fausto-mind-visualization.html`) ou a lib `3d-force-graph`.

## Endpoint
- `GET /api/creators/{slug}/mind` → JSON `{ nodes:[{id,x,y,z,topic,label,degree}], links:[{source,target}] }`.
  - Pré-computado por job (não calcular UMAP a cada request); cachear o JSON.

## Script Python de referência (gera nodes/links a partir dos chunks)
```python
# scripts/build_mind_graph.py
# requisitos: umap-learn, scikit-learn, numpy, psycopg, hdbscan
import json, numpy as np, psycopg, umap, hdbscan
from sklearn.neighbors import NearestNeighbors

def build_mind_graph(creator_id: str, db_url: str, k: int = 6):
    # 1) carregar chunks + embeddings
    with psycopg.connect(db_url) as conn:
        rows = conn.execute(
            "SELECT id, text, embedding FROM chunks WHERE creator_id = %s",
            (creator_id,)
        ).fetchall()
    ids   = [r[0] for r in rows]
    texts = [r[1] for r in rows]
    X = np.array([parse_vector(r[2]) for r in rows], dtype=np.float32)

    # 2) projeção 3D (UMAP, métrica cosseno)
    coords = umap.UMAP(n_components=3, metric="cosine",
                       n_neighbors=15, min_dist=0.1).fit_transform(X)

    # 3) clusters → cor/tema
    labels = hdbscan.HDBSCAN(min_cluster_size=15).fit_predict(coords)

    # 4) arestas por kNN (similaridade de cosseno)
    nn = NearestNeighbors(n_neighbors=k + 1, metric="cosine").fit(X)
    _, idx = nn.kneighbors(X)
    links, seen = [], set()
    for i, neigh in enumerate(idx):
        for j in neigh[1:]:
            a, b = sorted((i, int(j)))
            if (a, b) not in seen:
                seen.add((a, b)); links.append({"source": ids[a], "target": ids[b]})

    # 5) grau (para tamanho/brilho do nó)
    degree = {}
    for l in links:
        degree[l["source"]] = degree.get(l["source"], 0) + 1
        degree[l["target"]] = degree.get(l["target"], 0) + 1

    nodes = [{
        "id": ids[i],
        "x": float(coords[i, 0]) * 40,
        "y": float(coords[i, 1]) * 40,
        "z": float(coords[i, 2]) * 40,
        "topic": int(labels[i]),
        "label": texts[i][:60],
        "degree": degree.get(ids[i], 0),
    } for i in range(len(ids))]

    return {"nodes": nodes, "links": links}

def parse_vector(v):
    # pgvector retorna string '[0.1,0.2,...]' ou lista, dependendo do driver
    if isinstance(v, str):
        return [float(x) for x in v.strip("[]").split(",")]
    return list(v)

if __name__ == "__main__":
    import os, sys
    g = build_mind_graph(sys.argv[1], os.environ["DATABASE_URL"])
    print(json.dumps(g))
```

## Render
- Reuse o `fausto-mind-visualization.html` (protótipo Three.js já entregue): troque os dados simulados pelo JSON do endpoint (`nodes`/`links`), mapeie `topic`→cor e `degree`→tamanho/brilho.
- Alternativa rápida: `3d-force-graph` (vasturiano) consome `{nodes,links}` direto e já traz drag/zoom/hover.

## Custo
- UMAP/HDBSCAN rodam offline em CPU; recomputar só quando há conteúdo novo relevante. Custo desprezível.
