/** Synthesized speech audio (F1.3). `audio` is the raw encoded bytes. */
export interface SpokenAudio {
  audio: Buffer;
  /** MIME type, e.g. `audio/mpeg`. */
  contentType: string;
  /** Characters billed for this synthesis (drives cost/usage logging). */
  charCount: number;
}

export interface SpeakOptions {
  /** Provider voice id to speak with (per-creator clone voice). */
  voiceId: string;
  /** Model override (e.g. `eleven_multilingual_v2`). */
  modelId?: string;
}

/**
 * Text-to-speech adapter (doc 03 §voice). Implementations live behind this
 * interface so the clone's spoken reply doesn't depend on a specific provider.
 */
export interface VoiceSynth {
  readonly provider: string;
  speak(text: string, opts: SpeakOptions): Promise<SpokenAudio>;
}
