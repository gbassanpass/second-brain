import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RawDocument } from '../src/connectors/base.js';
import { FakeConnector } from '../src/connectors/fake.js';
import { ManualUploadConnector } from '../src/connectors/manual.js';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'manual-connector-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function write(rel: string, content: string) {
  const full = join(dir, rel);
  await mkdir(join(full, '..'), { recursive: true });
  await writeFile(full, content, 'utf8');
}

async function collect(connector: ManualUploadConnector): Promise<RawDocument[]> {
  const docs: RawDocument[] = [];
  for await (const d of connector.list('creator-id')) docs.push(d);
  return docs.sort((a, b) => String(a.metadata?.path).localeCompare(String(b.metadata?.path)));
}

describe('ManualUploadConnector', () => {
  it('returns nothing when the directory does not exist', async () => {
    const connector = new ManualUploadConnector({ baseDir: join(dir, 'missing') });
    expect(await collect(connector)).toEqual([]);
  });

  it('maps subdir names to document kinds', async () => {
    await write('posts/p1.md', '# Post 1\nbody');
    await write('articles/a1.md', 'long article body');
    await write('transcripts/t1.txt', 'spoken text');
    await write('loose.txt', 'no subdir');

    const docs = await collect(new ManualUploadConnector({ baseDir: dir }));
    expect(docs.map((d) => `${d.metadata?.path}:${d.kind}`)).toEqual([
      'articles/a1.md:article',
      'loose.txt:upload',
      'posts/p1.md:caption',
      'transcripts/t1.txt:transcript',
    ]);
    for (const d of docs) {
      expect(d.externalId).toMatch(/^[0-9a-f]{64}$/);
      expect(d.rawText.length).toBeGreaterThan(0);
    }
  });

  it('parses .srt and .vtt subtitles as transcripts', async () => {
    await write(
      'transcripts/clip.srt',
      '1\n00:00:00,000 --> 00:00:02,000\nOlá mundo\n\n2\n00:00:02,500 --> 00:00:05,000\nTudo bem?\n',
    );
    await write(
      'transcripts/clip.vtt',
      'WEBVTT\n\nNOTE intro\n\n00:00.000 --> 00:02.000\nLinha um\n\n00:02.000 --> 00:04.000\nLinha dois\n',
    );

    const docs = await collect(new ManualUploadConnector({ baseDir: dir }));
    const srt = docs.find((d) => d.metadata?.path === 'transcripts/clip.srt');
    const vtt = docs.find((d) => d.metadata?.path === 'transcripts/clip.vtt');
    expect(srt?.kind).toBe('transcript');
    expect(srt?.rawText).toBe('Olá mundo Tudo bem?');
    expect(vtt?.kind).toBe('transcript');
    expect(vtt?.rawText).toBe('Linha um Linha dois');
  });

  it('reads .json envelopes with rawText/title/url/publishedAt', async () => {
    await write(
      'posts/episode.json',
      JSON.stringify({
        title: 'Episódio 1',
        url: 'https://example.com/e1',
        rawText: 'transcrição parcial',
        kind: 'reel',
        publishedAt: '2026-04-01T12:00:00Z',
        metadata: { season: 1 },
      }),
    );

    const [doc] = await collect(new ManualUploadConnector({ baseDir: dir }));
    expect(doc?.title).toBe('Episódio 1');
    expect(doc?.kind).toBe('reel');
    expect(doc?.url).toBe('https://example.com/e1');
    expect(doc?.publishedAt?.toISOString()).toBe('2026-04-01T12:00:00.000Z');
    expect(doc?.metadata).toMatchObject({ season: 1, path: 'posts/episode.json' });
  });

  it('throws a descriptive error on invalid JSON envelopes', async () => {
    await write('posts/bad.json', JSON.stringify({ title: 'no body' }));
    await expect(collect(new ManualUploadConnector({ baseDir: dir }))).rejects.toThrow(
      /posts\/bad\.json.*rawText/i,
    );
  });

  it('skips media, dotfiles, README.md and empty text', async () => {
    await write('audio/voice.mp3', 'binary-ish');
    await write('.hidden/secret.md', 'nope');
    await write('README.md', 'project doc');
    await write('posts/empty.md', '   \n  ');

    expect(await collect(new ManualUploadConnector({ baseDir: dir }))).toEqual([]);
  });

  it('hashes the relative path into a stable externalId', async () => {
    await write('posts/p1.md', 'one');
    const [first] = await collect(new ManualUploadConnector({ baseDir: dir }));
    const [second] = await collect(new ManualUploadConnector({ baseDir: dir }));
    expect(first?.externalId).toBe(second?.externalId);
  });
});

describe('FakeConnector', () => {
  it('yields supplied docs and records each list() call', async () => {
    const fake = new FakeConnector([
      { externalId: 'x1', kind: 'caption', rawText: 'oi' },
      { externalId: 'x2', kind: 'article', rawText: 'tchau' },
    ]);
    const out: RawDocument[] = [];
    for await (const d of fake.list('c-1')) out.push(d);
    for await (const _ of fake.list('c-2')) {
      // exhaust the iterator
    }
    expect(out.map((d) => d.externalId)).toEqual(['x1', 'x2']);
    expect(fake.calls).toEqual(['c-1', 'c-2']);
  });
});
