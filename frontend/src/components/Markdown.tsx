'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Citation } from '../lib/chat';
import { IconExternal } from './icons';

const PROSE = `prose prose-invert max-w-none text-[15px] leading-relaxed text-zinc-100
  prose-headings:font-semibold prose-headings:text-zinc-100
  prose-h1:text-xl prose-h2:text-lg prose-h3:text-base
  prose-strong:text-zinc-100 prose-a:text-accent-gold
  prose-code:text-accent-gold prose-code:before:content-none prose-code:after:content-none
  prose-hr:border-zinc-700 prose-li:my-0.5`;

/**
 * Renders an assistant reply as styled markdown. Shared by chat, Train and
 * Conversations. When `citations` is passed, inline `[N]` markers become
 * clickable footnote pills with a popover showing the source + original link.
 */
export function Markdown({
  children,
  citations,
}: {
  children: string;
  citations?: Citation[];
}) {
  const hasCites = !!citations && citations.length > 0;
  // Turn `[1]` → a link `[1](#cite-1)` so the anchor renderer can intercept it.
  // Negative lookahead avoids touching real markdown links like `[1](http…)`.
  const content = hasCites ? children.replace(/\[(\d{1,2})\](?!\()/g, '[$1](#cite-$1)') : children;

  return (
    <div className={PROSE}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={
          hasCites
            ? {
                a: ({ href, children: linkChildren, ...rest }) => {
                  const m = href?.match(/^#cite-(\d+)$/);
                  if (m) {
                    const idx = Number(m[1]);
                    const cite = citations?.find((c) => c.index === idx);
                    if (cite) return <CitationPill index={idx} citation={cite} />;
                  }
                  return (
                    <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
                      {linkChildren}
                    </a>
                  );
                },
              }
            : undefined
        }
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

/** Superscript footnote pill that reveals the source on click. */
function CitationPill({ index, citation }: { index: number; citation: Citation }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-block align-super">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none transition ${
          open
            ? 'bg-accent-gold text-accent'
            : 'bg-accent-gold/20 text-accent-gold hover:bg-accent-gold/35'
        }`}
        aria-label={`Fonte ${index}`}
      >
        {index}
      </button>
      {open ? (
        <span className="absolute bottom-full left-1/2 z-20 mb-1 w-64 -translate-x-1/2 rounded-xl border border-zinc-700 bg-bg-sidebar p-3 text-left shadow-xl">
          <span className="block text-[10px] uppercase tracking-wide text-zinc-500">
            Fonte {index}
          </span>
          <span className="mt-1 block text-xs text-zinc-200">{citation.label}</span>
          {citation.snippet ? (
            <span className="mt-1.5 block border-l-2 border-zinc-700 pl-2 text-[11px] italic leading-snug text-zinc-400">
              “{citation.snippet}”
            </span>
          ) : null}
          {citation.url ? (
            <a
              href={citation.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs text-accent-gold hover:underline"
            >
              Abrir original <IconExternal width={12} height={12} />
            </a>
          ) : (
            <span className="mt-2 block text-[11px] text-zinc-500">Sem link de origem.</span>
          )}
        </span>
      ) : null}
    </span>
  );
}
