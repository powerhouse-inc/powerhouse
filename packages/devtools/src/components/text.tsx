import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn.js";
import type { DataAttributes } from "../lib/data-attributes.js";

/** A link set in running text: underlined, the underline darker on hover. */
export const LINK_CLASS =
  "cursor-pointer underline decoration-foreground/25 underline-offset-[3px] hover:decoration-foreground";

export function Mono({ className, ...props }: ComponentProps<"span">) {
  return (
    <span {...props} className={cn("font-mono text-[11.5px]", className)} />
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}

/** In place of a list or a value there is none of: "None.", "No files." */
export function EmptyText({
  children,
  className,
  ...data
}: { children: ReactNode; className?: string } & DataAttributes) {
  return (
    <p {...data} className={cn("text-[13px] text-muted-foreground", className)}>
      {children}
    </p>
  );
}

/** Server text with its `quoted` names and commands set as code. */
export function Prose({ text }: { text: string }) {
  return text
    .split("`")
    .map((part, index) =>
      index % 2 === 1 ? <Mono key={index}>{part}</Mono> : part,
    );
}

/** A quiet action in running text: "See all". */
export function TextButton({
  onClick,
  children,
  ...data
}: {
  onClick: () => void;
  children: ReactNode;
} & DataAttributes) {
  return (
    <button
      type="button"
      {...data}
      onClick={onClick}
      className={cn(
        LINK_CLASS,
        "text-[12px] text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
