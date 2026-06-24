import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Renders an assistant reply as styled markdown (headings, bold, lists,
 * tables, code). Shared by the chat, Train and Conversations so formatting is
 * consistent everywhere. `prose-invert` handles the dark theme.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div
      className="prose prose-invert max-w-none text-[15px] leading-relaxed text-zinc-100
        prose-headings:font-semibold prose-headings:text-zinc-100
        prose-h1:text-xl prose-h2:text-lg prose-h3:text-base
        prose-strong:text-zinc-100 prose-a:text-accent-gold
        prose-code:text-accent-gold prose-code:before:content-none prose-code:after:content-none
        prose-hr:border-zinc-700 prose-li:my-0.5"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
