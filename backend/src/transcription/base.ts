export interface TranscriptSegment {
  startSec: number;
  endSec: number;
  text: string;
  speaker?: string;
}

export interface TranscriptResult {
  text: string;
  language: string;
  segments: TranscriptSegment[];
  durationSec?: number;
}

export type TranscriberInput =
  | { kind: 'url'; url: string; mimeType?: string }
  | { kind: 'buffer'; data: Uint8Array; mimeType: string };

export interface TranscriberOptions {
  languageHint?: string;
}

export interface Transcriber {
  readonly provider: string;
  transcribe(input: TranscriberInput, options?: TranscriberOptions): Promise<TranscriptResult>;
}
