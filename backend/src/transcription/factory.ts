import type { Config } from '../config.js';
import type { Transcriber } from './base.js';
import { DeepgramTranscriber } from './deepgram.js';
import { FakeTranscriber } from './fake.js';

export function createTranscriber(config: Config): Transcriber {
  switch (config.TRANSCRIPTION_PROVIDER) {
    case 'deepgram':
      return new DeepgramTranscriber({ apiKey: config.DEEPGRAM_API_KEY });
    case 'assemblyai':
      throw new Error(
        'AssemblyAI transcriber not implemented yet — set TRANSCRIPTION_PROVIDER=deepgram for now.',
      );
    case 'fake':
      return new FakeTranscriber();
  }
}
