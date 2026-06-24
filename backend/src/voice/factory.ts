import type { Config } from '../config.js';
import type { VoiceSynth } from './base.js';
import { ElevenLabsVoiceSynth } from './elevenlabs.js';
import { FakeVoiceSynth } from './fake.js';

export function createVoiceSynth(config: Config): VoiceSynth {
  switch (config.VOICE_PROVIDER) {
    case 'elevenlabs':
      return new ElevenLabsVoiceSynth({
        apiKey: config.ELEVENLABS_API_KEY,
        model: config.VOICE_MODEL,
      });
    case 'fake':
      return new FakeVoiceSynth();
  }
}
