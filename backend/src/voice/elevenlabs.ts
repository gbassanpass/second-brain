import type { SpeakOptions, SpokenAudio, VoiceSynth } from './base.js';

interface ElevenLabsOptions {
  apiKey: string;
  /** Default model when a request doesn't override it. */
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/**
 * ElevenLabs text-to-speech adapter (F1.3). Calls
 * `POST /v1/text-to-speech/{voiceId}` and returns MP3 bytes. We default to a
 * multilingual model so PT-BR sounds natural.
 */
export class ElevenLabsVoiceSynth implements VoiceSynth {
  readonly provider = 'elevenlabs';
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ElevenLabsOptions) {
    if (!opts.apiKey) {
      throw new Error('ELEVENLABS_API_KEY is required to use the elevenlabs voice adapter');
    }
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? 'eleven_multilingual_v2';
    this.baseUrl = opts.baseUrl ?? 'https://api.elevenlabs.io';
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async speak(text: string, opts: SpeakOptions): Promise<SpokenAudio> {
    const trimmed = text.trim();
    if (!trimmed) throw new Error('cannot synthesize empty text');
    if (!opts.voiceId) throw new Error('a voiceId is required to synthesize speech');

    const url = `${this.baseUrl}/v1/text-to-speech/${encodeURIComponent(opts.voiceId)}`;
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        'xi-api-key': this.apiKey,
        'content-type': 'application/json',
        accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: trimmed,
        model_id: opts.modelId ?? this.model,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`elevenlabs TTS failed: ${res.status} ${detail.slice(0, 200)}`);
    }

    const audio = Buffer.from(await res.arrayBuffer());
    return {
      audio,
      contentType: res.headers.get('content-type') ?? 'audio/mpeg',
      charCount: trimmed.length,
    };
  }
}
