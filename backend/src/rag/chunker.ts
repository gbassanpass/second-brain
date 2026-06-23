export interface ChunkOptions {
  /** Alvo de tamanho por chunk em "tokens" (4 chars/token, ver `charsPerToken`). Default 400. */
  targetTokens?: number;
  /** Overlap entre chunks adjacentes, em tokens. Default 60 (~15% de 400). */
  overlapTokens?: number;
  /** Aproximação grosseira tokens↔chars (sem tokenizer real no MVP). Default 4. */
  charsPerToken?: number;
  /** Não emite chunk-tail menor que isso; mescla no anterior. Default 100. */
  minChunkTokens?: number;
}

export interface ChunkResult {
  ordinal: number;
  text: string;
  tokenCount: number;
}

const DEFAULTS = {
  targetTokens: 400,
  overlapTokens: 60,
  charsPerToken: 4,
  minChunkTokens: 100,
} as const;

/**
 * Quebra texto em chunks de ~300–500 tokens com overlap de ~15%, respeitando
 * limites de sentença (e parágrafo) quando possível. Para sentenças muito
 * longas, faz fallback por janela de caracteres com overlap. Determinístico.
 */
export function chunkText(rawText: string, opts: ChunkOptions = {}): ChunkResult[] {
  const target = opts.targetTokens ?? DEFAULTS.targetTokens;
  const overlap = opts.overlapTokens ?? DEFAULTS.overlapTokens;
  const cpt = opts.charsPerToken ?? DEFAULTS.charsPerToken;
  const minTokens = opts.minChunkTokens ?? DEFAULTS.minChunkTokens;

  const charsTarget = target * cpt;
  const charsOverlap = Math.min(overlap * cpt, charsTarget - 1);
  const charsMin = minTokens * cpt;

  const sentences = splitSentences(rawText);
  if (sentences.length === 0) return [];

  // Pass 1 — group sentences greedily up to charsTarget.
  const grouped: string[] = [];
  let buffer = '';
  for (const s of sentences) {
    if (buffer.length === 0) {
      buffer = s;
      continue;
    }
    if (buffer.length + 1 + s.length <= charsTarget) {
      buffer = `${buffer} ${s}`;
      continue;
    }
    grouped.push(buffer);
    const tail = takeLastChars(buffer, charsOverlap);
    buffer = tail ? `${tail} ${s}` : s;
  }
  if (buffer.length > 0) grouped.push(buffer);

  // Pass 2 — split oversized chunks (single-sentence > 2× target) by char window.
  const sized: string[] = [];
  for (const g of grouped) {
    if (g.length <= charsTarget * 2) {
      sized.push(g);
      continue;
    }
    let i = 0;
    while (i < g.length) {
      const end = Math.min(i + charsTarget, g.length);
      sized.push(g.slice(i, end));
      if (end >= g.length) break;
      i = end - charsOverlap;
    }
  }

  // Pass 3 — merge a tiny tail into the previous chunk.
  if (sized.length > 1) {
    const last = sized[sized.length - 1] ?? '';
    if (last.length < charsMin) {
      const prev = sized[sized.length - 2] ?? '';
      sized[sized.length - 2] = `${prev} ${last}`.trim();
      sized.pop();
    }
  }

  return sized.map((text, ordinal) => ({
    ordinal,
    text,
    tokenCount: Math.ceil(text.length / cpt),
  }));
}

function splitSentences(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  // Quebras: ponto-final/!/? seguido de whitespace; OU duas+ quebras de linha.
  // Decimal ("1.500") permanece intacto: o `.` não é seguido por whitespace.
  return normalized
    .split(/(?<=[.!?])\s+|\n{2,}/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function takeLastChars(text: string, chars: number): string {
  if (chars <= 0) return '';
  if (text.length <= chars) return text;
  const tail = text.slice(text.length - chars);
  const spaceIdx = tail.indexOf(' ');
  return spaceIdx > 0 ? tail.slice(spaceIdx + 1) : tail;
}
