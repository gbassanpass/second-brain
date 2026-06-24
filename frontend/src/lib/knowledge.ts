/**
 * Add Knowledge (F1.9). Manually feed the clone a piece of knowledge — free
 * text or a Q&A — which the backend indexes immediately for the RAG to use.
 */

export type KnowledgeKind = 'note' | 'qa';

export type KnowledgeInput =
  | { type: 'note'; text: string; title?: string }
  | { type: 'qa'; question: string; answer: string };

export interface AddKnowledgeResult {
  added: boolean;
  documentId: string;
  chunkCount: number;
  kind: 'article' | 'qa';
}

export async function addKnowledge(
  slug: string,
  input: KnowledgeInput,
  token: string | null,
): Promise<AddKnowledgeResult> {
  const res = await fetch(`/api/creators/${encodeURIComponent(slug)}/knowledge`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`knowledge add failed: ${res.status}`);
  return (await res.json()) as AddKnowledgeResult;
}
