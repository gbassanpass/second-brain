import type { SpeakOptions, SpokenAudio, VoiceSynth } from './base.js';

/** Minimal valid-ish MP3 frame header bytes — enough to assert "got audio". */
const FAKE_MP3_HEADER = Buffer.from([0xff, 0xfb, 0x90, 0x00]);

/**
 * Deterministic voice synth for tests: returns a tiny fixed audio payload whose
 * length tracks the input so assertions can distinguish calls. No network.
 */
export class FakeVoiceSynth implements VoiceSynth {
  readonly provider = 'fake';

  async speak(text: string, _opts: SpeakOptions): Promise<SpokenAudio> {
    const trimmed = text.trim();
    if (!trimmed) throw new Error('cannot synthesize empty text');
    const padding = Buffer.alloc(Math.min(trimmed.length, 64), 0x55);
    return {
      audio: Buffer.concat([FAKE_MP3_HEADER, padding]),
      contentType: 'audio/mpeg',
      charCount: trimmed.length,
    };
  }
}
