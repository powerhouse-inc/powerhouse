import { useMemo, type ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { highlight, type CodeLang } from "../lib/highlight.js";
import { ScrollArea } from "../ui/scroll-area.js";

export function Code({
  children,
  className,
  lang,
}: {
  children: ReactNode;
  className?: string;
  lang?: CodeLang;
}) {
  // A file of up to 256 KiB takes long to highlight: not at every render.
  const body = useMemo(
    () =>
      lang && typeof children === "string"
        ? highlight(children, lang)
        : children,
    [children, lang],
  );
  return (
    <ScrollArea
      className={cn(
        "rounded-md bg-foreground/[0.035] font-mono text-[12px] leading-relaxed whitespace-pre",
        className,
      )}
    >
      <pre className="px-3 py-2 [white-space:inherit]">{body}</pre>
    </ScrollArea>
  );
}
