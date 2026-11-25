import { Check, Copy } from "lucide-react";
import { useCopy } from "../hooks/use-copy.js";
import { cn } from "../lib/cn.js";
import { Button } from "../ui/button.js";
import { Mono } from "./text.js";

export function CopyButton({ text }: { text: string }) {
  const [copied, copy] = useCopy();
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      data-testid="ph-copy"
      aria-label={copied ? "Copied" : `Copy ${text}`}
      title={copied ? "Copied" : `Copy ${text}`}
      onClick={() => copy(text)}
    >
      {copied ? <Check /> : <Copy />}
    </Button>
  );
}

/** A command on its own line, with a button that copies it. */
export function CopyCommand({
  command,
  className,
}: {
  command: string;
  className?: string;
}) {
  const [copied, copy] = useCopy();
  return (
    <div
      data-testid="ph-command"
      className={cn(
        "flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-foreground/[0.035] py-1.5 pr-1.5 pl-3",
        className,
      )}
    >
      <Mono className="min-w-0 text-[12px] break-words">{command}</Mono>
      <Button
        variant="outline"
        size="xs"
        data-testid="ph-copy"
        aria-label={`Copy ${command}`}
        className="ml-auto"
        onClick={() => copy(command)}
      >
        {copied ? <Check /> : <Copy />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
