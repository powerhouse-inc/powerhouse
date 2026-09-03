import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Markdown renderer for assistant messages.
 *
 * Uses react-markdown, which builds React elements from the markdown AST and
 * does not execute raw HTML — safe for model-generated content. remark-gfm
 * adds the table/strikethrough/task-list syntax the agent emits. Element
 * styling is scoped to the chat window's text-sm scale via Tailwind
 * utilities, so no extra CSS is needed.
 */
export function Markdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (
          <p className="my-1.5 leading-relaxed first:mt-0 last:mb-0">
            {children}
          </p>
        ),
        h1: ({ children }) => (
          <h1 className="mb-1 mt-3 font-semibold first:mt-0">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="mb-1 mt-3 font-semibold first:mt-0">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="mb-1 mt-2.5 font-semibold first:mt-0">{children}</h3>
        ),
        ul: ({ children }) => (
          <ul className="my-1.5 list-disc space-y-0.5 pl-5">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="my-1.5 list-decimal space-y-0.5 pl-5">{children}</ol>
        ),
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        blockquote: ({ children }) => (
          <blockquote className="my-1.5 border-l-2 border-border pl-2.5 text-muted-foreground">
            {children}
          </blockquote>
        ),
        hr: () => <hr className="my-2 border-border" />,
        a: ({ children, href }) => (
          <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary underline"
          >
            {children}
          </a>
        ),
        table: ({ children }) => (
          <div className="my-1.5 overflow-x-auto">
            <table className="w-full border-collapse text-xs">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead>{children}</thead>,
        th: ({ children }) => (
          <th className="border border-border bg-muted px-2 py-1 text-left font-semibold">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border border-border px-2 py-1 align-top">
            {children}
          </td>
        ),
        pre: ({ children }) => (
          <pre className="my-1.5 overflow-x-auto rounded-md bg-muted p-2.5 text-xs leading-relaxed">
            {children}
          </pre>
        ),
        code: ({ children, className }) => {
          // Fenced blocks carry a `language-*` class; inline code has none.
          const isBlock = (className ?? "").startsWith("language-");
          if (isBlock) {
            return <code className={className}>{children}</code>;
          }
          return (
            <code className="rounded bg-muted px-1 py-0.5 text-[0.8125rem]">
              {children}
            </code>
          );
        },
      }}
    >
      {text}
    </ReactMarkdown>
  );
}
