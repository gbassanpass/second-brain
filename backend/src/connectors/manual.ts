import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, relative, sep } from 'node:path';
import { z } from 'zod';
import type { ContentConnector, DocumentKind, RawDocument } from './base.js';

interface ManualUploadConnectorOptions {
  baseDir: string;
}

const SUPPORTED_TEXT_EXTS = new Set(['.md', '.txt']);
const SUPPORTED_SUBTITLE_EXTS = new Set(['.srt', '.vtt']);
const SUPPORTED_JSON_EXT = '.json';
// Media files are passed through the Transcriber adapter in E1.5, not this connector.
const MEDIA_EXTS = new Set(['.mp3', '.mp4', '.wav', '.m4a', '.mov']);

const SKIP_FILENAMES = new Set(['readme.md', '.gitkeep', '.ds_store']);

const SUBDIR_TO_KIND: Record<string, DocumentKind> = {
  posts: 'caption',
  transcripts: 'transcript',
  articles: 'article',
  uploads: 'upload',
};

const jsonDocSchema = z.object({
  rawText: z.string().min(1),
  title: z.string().optional(),
  url: z.string().optional(),
  kind: z.enum(['reel', 'video', 'caption', 'article', 'transcript', 'upload']).optional(),
  publishedAt: z.string().datetime({ offset: true }).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export class ManualUploadConnector implements ContentConnector {
  readonly kind = 'manual';
  private readonly baseDir: string;

  constructor(opts: ManualUploadConnectorOptions) {
    this.baseDir = opts.baseDir;
  }

  async *list(_creatorId: string): AsyncIterable<RawDocument> {
    let exists = false;
    try {
      const s = await stat(this.baseDir);
      exists = s.isDirectory();
    } catch {
      exists = false;
    }
    if (!exists) return;

    for await (const absPath of walk(this.baseDir)) {
      const doc = await fileToRawDocument(absPath, this.baseDir);
      if (doc) yield doc;
    }
  }
}

async function* walk(dir: string): AsyncIterable<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      yield* walk(full);
    } else if (e.isFile()) {
      yield full;
    }
  }
}

async function fileToRawDocument(absPath: string, baseDir: string): Promise<RawDocument | null> {
  const rel = relative(baseDir, absPath);
  const ext = extname(absPath).toLowerCase();
  const basename = absPath.split(sep).at(-1)?.toLowerCase() ?? '';

  if (SKIP_FILENAMES.has(basename)) return null;
  if (MEDIA_EXTS.has(ext)) return null;

  const base = {
    externalId: hashPath(rel),
    metadata: { path: rel },
  };

  if (SUPPORTED_TEXT_EXTS.has(ext)) {
    const rawText = (await readFile(absPath, 'utf8')).trim();
    if (!rawText) return null;
    return {
      ...base,
      kind: kindFromRelativePath(rel),
      title: titleFromPath(rel),
      rawText,
    };
  }

  if (SUPPORTED_SUBTITLE_EXTS.has(ext)) {
    const rawText = parseSubtitles(await readFile(absPath, 'utf8'), ext);
    if (!rawText) return null;
    return {
      ...base,
      kind: 'transcript',
      title: titleFromPath(rel),
      rawText,
    };
  }

  if (ext === SUPPORTED_JSON_EXT) {
    const parsed = jsonDocSchema.safeParse(JSON.parse(await readFile(absPath, 'utf8')));
    if (!parsed.success) {
      throw new Error(
        `Invalid manual upload JSON ${rel}: ${parsed.error.issues
          .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
          .join('; ')}`,
      );
    }
    const data = parsed.data;
    return {
      ...base,
      kind: data.kind ?? kindFromRelativePath(rel),
      title: data.title ?? titleFromPath(rel),
      url: data.url,
      rawText: data.rawText,
      publishedAt: data.publishedAt ? new Date(data.publishedAt) : undefined,
      metadata: { ...base.metadata, ...(data.metadata ?? {}) },
    };
  }

  return null;
}

function kindFromRelativePath(rel: string): DocumentKind {
  const first = rel.split(sep)[0]?.toLowerCase() ?? '';
  return SUBDIR_TO_KIND[first] ?? 'upload';
}

function titleFromPath(rel: string): string {
  const base = rel.split(sep).at(-1) ?? rel;
  return base.replace(/\.[^.]+$/, '');
}

function hashPath(rel: string): string {
  return createHash('sha256').update(rel).digest('hex');
}

function parseSubtitles(content: string, ext: string): string {
  const lines = content.replace(/\r/g, '').split('\n');
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (ext === '.vtt' && /^WEBVTT/i.test(line)) continue;
    if (/^\d+$/.test(line)) continue; // SRT cue number
    if (/-->/.test(line)) continue; // timing line
    if (/^NOTE\b/i.test(line)) continue; // VTT note
    out.push(line);
  }
  return out.join(' ').trim();
}
