import { describe, expect, it } from 'vitest';
import {
  type ChatApiResponse,
  type ChatSource,
  assistantMessageFromResponse,
  dedupeSources,
  shouldSubmitOnKey,
  sourceLabel,
} from './chat';

function source(over: Partial<ChatSource> = {}): ChatSource {
  return {
    chunkId: 'c1',
    documentId: 'd1',
    ordinal: 0,
    title: 'Título',
    score: 0.9,
    rank: 1,
    ...over,
  };
}

function response(over: Partial<ChatApiResponse> = {}): ChatApiResponse {
  return {
    conversationId: 'conv-1',
    messageId: 'msg-1',
    content: 'resposta',
    fontes: [],
    fallback: null,
    guardrailFlag: null,
    ...over,
  };
}

describe('sourceLabel', () => {
  it('prefixes the title', () => {
    expect(sourceLabel(source({ title: 'EUA × Irã' }))).toBe('de: EUA × Irã');
  });
  it('falls back when the title is null or blank', () => {
    expect(sourceLabel(source({ title: null }))).toBe('de: conteúdo sem título');
    expect(sourceLabel(source({ title: '  ' }))).toBe('de: conteúdo sem título');
  });
});

describe('dedupeSources', () => {
  it('collapses chunks from the same document, preserving order', () => {
    const out = dedupeSources([
      source({ chunkId: 'a', documentId: 'd1', title: 'Doc 1' }),
      source({ chunkId: 'b', documentId: 'd1', title: 'Doc 1' }),
      source({ chunkId: 'c', documentId: 'd2', title: 'Doc 2' }),
    ]);
    expect(out).toEqual([
      { documentId: 'd1', label: 'de: Doc 1' },
      { documentId: 'd2', label: 'de: Doc 2' },
    ]);
  });
});

describe('assistantMessageFromResponse', () => {
  it('maps content + deduped sources, no guardrail', () => {
    const msg = assistantMessageFromResponse(
      response({
        fontes: [source({ documentId: 'd1' }), source({ chunkId: 'c2', documentId: 'd1' })],
      }),
    );
    expect(msg.role).toBe('assistant');
    expect(msg.pending).toBe(false);
    expect(msg.guardrail).toBe(false);
    expect(msg.sources).toHaveLength(1);
  });

  it('flags the guardrail on investment', () => {
    const msg = assistantMessageFromResponse(response({ guardrailFlag: 'investment' }));
    expect(msg.guardrail).toBe(true);
  });

  it('drops sources on the no_context refusal', () => {
    const msg = assistantMessageFromResponse(
      response({
        fallback: 'no_context',
        fontes: [source()],
        content: 'Não tenho isso registrado',
      }),
    );
    expect(msg.sources).toEqual([]);
  });
});

describe('shouldSubmitOnKey', () => {
  it('submits on plain Enter', () => {
    expect(shouldSubmitOnKey('Enter', false, false)).toBe(true);
  });
  it('does not submit on Shift+Enter', () => {
    expect(shouldSubmitOnKey('Enter', true, false)).toBe(false);
  });
  it('does not submit mid IME composition', () => {
    expect(shouldSubmitOnKey('Enter', false, true)).toBe(false);
  });
  it('ignores other keys', () => {
    expect(shouldSubmitOnKey('a', false, false)).toBe(false);
  });
});
