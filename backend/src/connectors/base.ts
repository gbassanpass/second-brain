export type DocumentKind =
  | 'reel'
  | 'video'
  | 'caption'
  | 'article'
  | 'transcript'
  | 'upload'
  | 'qa';

export interface RawDocument {
  /** Stable id within the source (e.g. sha256 of the relative path). */
  externalId: string;
  kind: DocumentKind;
  title?: string;
  url?: string;
  /** Normalized text body — what gets chunked and embedded downstream. */
  rawText: string;
  /** Path/URL of the raw media in Supabase Storage, if applicable. */
  mediaUrl?: string;
  publishedAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface ContentConnector {
  readonly kind: 'manual' | 'phyllo' | 'fake' | string;
  list(creatorId: string): AsyncIterable<RawDocument>;
}
