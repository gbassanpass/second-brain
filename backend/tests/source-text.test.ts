import { describe, expect, it } from 'vitest';
import {
  SourceTextError,
  extractFileText,
  fetchUrlText,
  htmlToText,
} from '../src/services/source-text.js';

describe('source-text (F1.9 URL + file)', () => {
  it('htmlToText strips tags and reads the title', () => {
    const html =
      '<html><head><title>Geopolítica hoje</title><style>x{}</style></head><body><script>1</script><h1>Olá</h1><p>texto do post aqui</p></body></html>';
    const { title, text } = htmlToText(html);
    expect(title).toBe('Geopolítica hoje');
    expect(text).toContain('Olá');
    expect(text).toContain('texto do post aqui');
    expect(text).not.toContain('<');
    expect(text).not.toContain('x{}');
  });

  it('fetchUrlText fetches and extracts (fake fetch)', async () => {
    const fakeFetch = (async () =>
      new Response('<title>T</title><body>conteúdo suficiente para passar</body>', {
        status: 200,
      })) as unknown as typeof fetch;
    const { title, text } = await fetchUrlText('https://exemplo.com/post', fakeFetch);
    expect(title).toBe('T');
    expect(text).toContain('conteúdo suficiente');
  });

  it('fetchUrlText rejects non-http and failed fetches', async () => {
    await expect(fetchUrlText('ftp://x/y')).rejects.toBeInstanceOf(SourceTextError);
    const bad = (async () => new Response('x', { status: 404 })) as unknown as typeof fetch;
    await expect(fetchUrlText('https://x/y', bad)).rejects.toBeInstanceOf(SourceTextError);
  });

  it('extractFileText reads txt/md and rejects unsupported', async () => {
    const bytes = new TextEncoder().encode('Esse é o conteúdo do meu arquivo de texto.');
    const { title, text } = await extractFileText('minhas-notas.txt', bytes);
    expect(title).toBe('minhas-notas');
    expect(text).toContain('conteúdo do meu arquivo');
    await expect(extractFileText('foto.png', bytes)).rejects.toBeInstanceOf(SourceTextError);
  });
});
