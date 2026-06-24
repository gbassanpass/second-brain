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

/** Add knowledge from a URL — backend fetches the page and extracts the text. */
export async function addKnowledgeUrl(
  slug: string,
  url: string,
  token: string | null,
): Promise<AddKnowledgeResult> {
  const res = await fetch(`/api/creators/${encodeURIComponent(slug)}/knowledge/url`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error(`knowledge url failed: ${res.status}`);
  return (await res.json()) as AddKnowledgeResult;
}

/** Add knowledge from an uploaded file (txt/md/pdf). */
export async function addKnowledgeFile(
  slug: string,
  file: File,
  token: string | null,
): Promise<AddKnowledgeResult> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`/api/creators/${encodeURIComponent(slug)}/knowledge/file`, {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) throw new Error(`knowledge file failed: ${res.status}`);
  return (await res.json()) as AddKnowledgeResult;
}
