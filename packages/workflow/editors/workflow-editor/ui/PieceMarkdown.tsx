// Setup instructions a piece ships as markdown. Rendered with react-markdown,
// which builds elements from the AST and never executes raw HTML.

// That matters here: the text comes from a third-party npm package, so an
// HTML-string renderer would need sanitising to be safe.
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Loaded lazily by the property panel: react-markdown and its remark chain are
// a large graph, and most blocks have no markdown at all.
export default function PieceMarkdown({ text }: { text: string }) {
  return (
    <div className="rounded bg-muted px-2 py-1.5 text-xs text-muted-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => (
            <p className="my-1 leading-relaxed first:mt-0 last:mb-0">
              {children}
            </p>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-muted-foreground">
              {children}
            </strong>
          ),
          ol: ({ children }) => (
            <ol className="my-1 list-decimal space-y-0.5 pl-4">{children}</ol>
          ),
          ul: ({ children }) => (
            <ul className="my-1 list-disc space-y-0.5 pl-4">{children}</ul>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          // A fenced block is where a piece puts the endpoint URL, so it has to
          // stay selectable and must not wrap into an unusable smear.
          pre: ({ children }) => (
            <pre className="my-1 overflow-x-auto rounded border border-foreground/10 bg-card px-2 py-1.5 font-mono text-[11px] text-foreground">
              {children}
            </pre>
          ),
          code: ({ children }) => (
            <code className="font-mono text-[11px] text-foreground">
              {children}
            </code>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className="text-muted-foreground underline"
            >
              {children}
            </a>
          ),
          h1: ({ children }) => (
            <p className="mb-1 font-semibold text-muted-foreground">
              {children}
            </p>
          ),
          h2: ({ children }) => (
            <p className="mb-1 font-semibold text-muted-foreground">
              {children}
            </p>
          ),
          h3: ({ children }) => (
            <p className="mb-1 font-semibold text-muted-foreground">
              {children}
            </p>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
