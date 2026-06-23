import type {
  Transcriber,
  TranscriberInput,
  TranscriberOptions,
  TranscriptResult,
  TranscriptSegment,
} from './base.js';

interface DeepgramOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

interface DeepgramWord {
  word: string;
  start: number;
  end: number;
  speaker?: number;
}

interface DeepgramResponse {
  metadata?: { duration?: number };
  results: {
    channels: {
      alternatives: {
        transcript: string;
        words?: DeepgramWord[];
        paragraphs?: {
          paragraphs: {
            start: number;
            end: number;
            speaker?: number;
            sentences: { text: string; start: number; end: number }[];
          }[];
        };
      }[];
      detected_language?: string;
    }[];
  };
}

export class DeepgramTranscriber implements Transcriber {
  readonly provider = 'deepgram';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: DeepgramOptions) {
    if (!opts.apiKey) {
      throw new Error('DEEPGRAM_API_KEY is required to use the deepgram transcription adapter');
    }
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? 'nova-3';
    this.baseUrl = opts.baseUrl ?? 'https://api.deepgram.com';
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async transcribe(
    input: TranscriberInput,
    options: TranscriberOptions = {},
  ): Promise<TranscriptResult> {
    const params = new URLSearchParams({
      model: this.model,
      smart_format: 'true',
      paragraphs: 'true',
      diarize: 'true',
    });
    if (options.languageHint) params.set('language', options.languageHint);

    const headers: Record<string, string> = {
      authorization: `Token ${this.apiKey}`,
    };
    let body: string | Uint8Array;
    if (input.kind === 'url') {
      headers['content-type'] = 'application/json';
      body = JSON.stringify({ url: input.url });
    } else {
      headers['content-type'] = input.mimeType;
      body = input.data;
    }

    const res = await this.fetchImpl(`${this.baseUrl}/v1/listen?${params.toString()}`, {
      method: 'POST',
      headers,
      body,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Deepgram error ${res.status} ${res.statusText}: ${text.slice(0, 500)}`);
    }

    const data = (await res.json()) as DeepgramResponse;
    return toTranscript(data, options.languageHint);
  }
}

function toTranscript(data: DeepgramResponse, languageHint?: string): TranscriptResult {
  const channel = data.results.channels[0];
  const alt = channel?.alternatives[0];
  if (!alt) {
    return { text: '', language: languageHint ?? 'unknown', segments: [] };
  }

  const segments: TranscriptSegment[] = [];
  for (const p of alt.paragraphs?.paragraphs ?? []) {
    for (const s of p.sentences) {
      segments.push({
        startSec: s.start,
        endSec: s.end,
        text: s.text,
        speaker: p.speaker !== undefined ? String(p.speaker) : undefined,
      });
    }
  }

  return {
    text: alt.transcript,
    language: channel?.detected_language ?? languageHint ?? 'unknown',
    segments,
    durationSec: data.metadata?.duration,
  };
}
