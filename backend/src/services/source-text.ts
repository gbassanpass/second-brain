import { extractText, getDocumentProxy } from 'unpdf';

/**
 * Extract plain text from a web page or an uploaded file so it can be indexed
 * as knowledge (F1.9 — URL + file upload). Best-effort: strips HTML, reads
 * txt/md directly, and parses PDFs via unpdf.
 */

const MAX_CHARS = 40000;

export class SourceTextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SourceTextError';
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** Strip scripts/styles/tags from HTML → readable text + the <title>. */
export function htmlToText(html: string): { title: string | null; text: string } {
  const rawTitle = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const title = rawTitle ? decodeEntities(rawTitle.trim()).slice(0, 120) : null;
  const text = decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  ).slice(0, MAX_CHARS);
  return { title, text };
}

/** Fetch a URL and extract its main text. Only http(s). */
export async function fetchUrlText(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ title: string | null; text: string }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SourceTextError('URL inválida');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SourceTextError('Só http(s)');
  }
  const res = await fetchImpl(url, {
    headers: { 'user-agent': 'falacomigo-bot/1.0 (+https://falacomigo.ai)' },
  });
  if (!res.ok) throw new SourceTextError(`falha ao buscar a URL: ${res.status}`);
  const html = await res.text();
  const { title, text } = htmlToText(html);
  if (text.length < 20) throw new SourceTextError('não consegui extrair texto dessa página');
  return { title, text };
}

/** Extract text from an uploaded file by name/type. Supports txt/md/pdf. */
export async function extractFileText(
  name: string,
  bytes: Uint8Array,
): Promise<{ title: string; text: string }> {
  const lower = name.toLowerCase();
  let text: string;
  if (lower.endsWith('.pdf')) {
    const pdf = await getDocumentProxy(bytes);
    const { text: pdfText } = await extractText(pdf, { mergePages: true });
    text = (Array.isArray(pdfText) ? pdfText.join('\n') : pdfText).replace(/\s+/g, ' ').trim();
  } else if (lower.endsWith('.txt') || lower.endsWith('.md') || lower.endsWith('.markdown')) {
    text = new TextDecoder().decode(bytes).trim();
  } else {
    throw new SourceTextError('formato não suportado (use .txt, .md ou .pdf)');
  }
  if (text.length < 20) throw new SourceTextError('arquivo sem texto extraível');
  return { title: name.replace(/\.[^.]+$/, '').slice(0, 120), text: text.slice(0, MAX_CHARS) };
}
