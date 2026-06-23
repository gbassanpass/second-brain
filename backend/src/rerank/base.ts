export interface RerankCandidate {
  id: string;
  text: string;
}

export interface RerankResult {
  id: string;
  text: string;
  score: number;
  /** Index in the original candidates array (useful for downstream metadata). */
  originalIndex: number;
}

export interface Reranker {
  readonly provider: string;
  rerank(query: string, candidates: RerankCandidate[], topK: number): Promise<RerankResult[]>;
}
