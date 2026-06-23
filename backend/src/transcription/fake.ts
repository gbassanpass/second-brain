import { createHash } from 'node:crypto';
import type {
  Transcriber,
  TranscriberInput,
  TranscriberOptions,
  TranscriptResult,
} from './base.js';

interface FakeTranscriberOptions {
  /** Fixed transcript to return. If absent, derives one from the input. */
  transcript?: string | ((input: TranscriberInput) => string);
}

/**
 * Deterministic transcriber for tests: returns a canned transcript or one
 * derived from the input (URL string or hash of the buffer), with a single
 * synthesized segment so downstream chunking still has something to work with.
 */
export class FakeTranscriber implements Transcriber {
  readonly provider = 'fake';
  private readonly opts: FakeTranscriberOptions;

  constructor(opts: FakeTranscriberOptions = {}) {
    this.opts = opts;
  }

  async transcribe(
    input: TranscriberInput,
    options: TranscriberOptions = {},
  ): Promise<TranscriptResult> {
    const text = this.resolveText(input);
    return {
      text,
      language: options.languageHint ?? 'pt',
      segments: [{ startSec: 0, endSec: 1, text, speaker: '0' }],
      durationSec: 1,
    };
  }

  private resolveText(input: TranscriberInput): string {
    if (typeof this.opts.transcript === 'string') return this.opts.transcript;
    if (typeof this.opts.transcript === 'function') return this.opts.transcript(input);
    if (input.kind === 'url') return `[fake-transcript:${input.url}]`;
    const hash = createHash('sha256').update(input.data).digest('hex').slice(0, 12);
    return `[fake-transcript:buffer:${hash}]`;
  }
}
