import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { DeepgramTranscriber } from '../src/transcription/deepgram.js';
import { createTranscriber } from '../src/transcription/factory.js';
import { FakeTranscriber } from '../src/transcription/fake.js';

describe('FakeTranscriber', () => {
  it('derives a deterministic transcript from a URL input', async () => {
    const t = new FakeTranscriber();
    const a = await t.transcribe({ kind: 'url', url: 'https://x/a.mp3' });
    const b = await t.transcribe({ kind: 'url', url: 'https://x/a.mp3' });
    expect(a).toEqual(b);
    expect(a.text).toContain('https://x/a.mp3');
    expect(a.segments).toHaveLength(1);
    expect(a.language).toBe('pt');
  });

  it('derives a deterministic transcript from a buffer input', async () => {
    const t = new FakeTranscriber();
    const buf = new TextEncoder().encode('audio-bytes');
    const a = await t.transcribe({ kind: 'buffer', data: buf, mimeType: 'audio/mp3' });
    const b = await t.transcribe({ kind: 'buffer', data: buf, mimeType: 'audio/mp3' });
    expect(a.text).toEqual(b.text);
    expect(a.text).toMatch(/^\[fake-transcript:buffer:[0-9a-f]{12}\]$/);
  });

  it('accepts a fixed transcript override', async () => {
    const t = new FakeTranscriber({ transcript: 'olá mundo' });
    const out = await t.transcribe({ kind: 'url', url: 'x' });
    expect(out.text).toBe('olá mundo');
  });
});

describe('DeepgramTranscriber', () => {
  it('requires an API key', () => {
    expect(() => new DeepgramTranscriber({ apiKey: '' })).toThrow(/DEEPGRAM_API_KEY/);
  });

  it('sends URL inputs as JSON and parses paragraphs into segments', async () => {
    const fetchImpl: typeof fetch = async (url, init) => {
      expect(String(url)).toContain('/v1/listen?');
      expect(String(url)).toContain('language=pt');
      expect(init?.headers).toMatchObject({ 'content-type': 'application/json' });
      const body = JSON.parse(init?.body as string) as { url: string };
      expect(body.url).toBe('https://example.com/x.mp3');
      return new Response(
        JSON.stringify({
          metadata: { duration: 12.5 },
          results: {
            channels: [
              {
                detected_language: 'pt',
                alternatives: [
                  {
                    transcript: 'olá mundo',
                    paragraphs: {
                      paragraphs: [
                        {
                          start: 0,
                          end: 1.5,
                          speaker: 0,
                          sentences: [{ text: 'olá', start: 0, end: 0.7 }],
                        },
                        {
                          start: 0.7,
                          end: 1.5,
                          speaker: 1,
                          sentences: [{ text: 'mundo', start: 0.7, end: 1.5 }],
                        },
                      ],
                    },
                  },
                ],
              },
            ],
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };

    const t = new DeepgramTranscriber({ apiKey: 'k', fetchImpl });
    const res = await t.transcribe(
      { kind: 'url', url: 'https://example.com/x.mp3' },
      { languageHint: 'pt' },
    );
    expect(res.text).toBe('olá mundo');
    expect(res.language).toBe('pt');
    expect(res.durationSec).toBe(12.5);
    expect(res.segments).toEqual([
      { startSec: 0, endSec: 0.7, text: 'olá', speaker: '0' },
      { startSec: 0.7, endSec: 1.5, text: 'mundo', speaker: '1' },
    ]);
  });

  it('forwards buffer inputs with the declared mime type', async () => {
    const fetchImpl: typeof fetch = async (_url, init) => {
      expect(init?.headers).toMatchObject({ 'content-type': 'audio/mpeg' });
      expect(init?.body).toBeInstanceOf(Uint8Array);
      return new Response(
        JSON.stringify({
          results: {
            channels: [
              {
                alternatives: [{ transcript: 'hi', paragraphs: { paragraphs: [] } }],
              },
            ],
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    };
    const t = new DeepgramTranscriber({ apiKey: 'k', fetchImpl });
    const res = await t.transcribe({
      kind: 'buffer',
      data: new Uint8Array([1, 2, 3]),
      mimeType: 'audio/mpeg',
    });
    expect(res.text).toBe('hi');
    expect(res.segments).toEqual([]);
  });
});

describe('createTranscriber', () => {
  it('returns fake in test mode', () => {
    const t = createTranscriber(loadConfig({ APP_ENV: 'test' }));
    expect(t.provider).toBe('fake');
  });

  it('returns deepgram when configured', () => {
    const t = createTranscriber(
      loadConfig({
        APP_ENV: 'test',
        TRANSCRIPTION_PROVIDER: 'deepgram',
        DEEPGRAM_API_KEY: 'k',
      }),
    );
    expect(t.provider).toBe('deepgram');
  });

  it('throws a clear error for not-yet-implemented providers', () => {
    expect(() =>
      createTranscriber(loadConfig({ APP_ENV: 'test', TRANSCRIPTION_PROVIDER: 'assemblyai' })),
    ).toThrow(/AssemblyAI/);
  });
});
