import type { ContentConnector, RawDocument } from './base.js';

/**
 * In-memory connector for tests/E2 fixtures. Yields the supplied docs in order
 * and records the creatorId(s) it was asked to list for.
 */
export class FakeConnector implements ContentConnector {
  readonly kind = 'fake';
  readonly calls: string[] = [];
  private readonly docs: RawDocument[];

  constructor(docs: RawDocument[] = []) {
    this.docs = docs;
  }

  async *list(creatorId: string): AsyncIterable<RawDocument> {
    this.calls.push(creatorId);
    for (const d of this.docs) yield d;
  }
}
