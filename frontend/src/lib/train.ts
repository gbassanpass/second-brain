/** Training correction (F1.12). Sends the creator's "right answer" to the
 *  backend, which stores it as a high-signal Q&A document the RAG will reuse. */

export type TrainRating = 'nada' | 'pouco' | 'meio' | 'quase' | 'exato';

export const RATING_OPTIONS: { id: TrainRating; label: string }[] = [
  { id: 'nada', label: 'Nada' },
  { id: 'pouco', label: 'Pouco' },
  { id: 'meio', label: 'Mais ou menos' },
  { id: 'quase', label: 'Quase' },
  { id: 'exato', label: 'Exato' },
];

export async function submitCorrection(
  slug: string,
  input: { question: string; answer: string; rating?: TrainRating },
  token: string | null,
): Promise<boolean> {
  const res = await fetch(`/api/creators/${encodeURIComponent(slug)}/train`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(input),
  });
  return res.ok;
}
