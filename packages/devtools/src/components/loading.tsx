import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn.js";
import type { DataAttributes } from "../lib/data-attributes.js";

/** Content that is on its way. */
export function Loading({
  children,
  compact = false,
  ...data
}: {
  children: ReactNode;
  compact?: boolean;
} & DataAttributes) {
  return (
    <p
      {...data}
      role="status"
      className={cn(
        "flex items-center justify-center gap-2 text-[13px] text-muted-foreground",
        compact ? "py-6" : "py-8 @md/main:py-14",
      )}
    >
      <LoaderCircle aria-hidden className="size-3.5 animate-spin" />
      {children}
    </p>
  );
}

/** A grey bar where a value will be, sized like the value. */
export function Skeleton({ className }: { className: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block h-3 rounded-sm bg-foreground/10 align-middle",
        className,
      )}
    />
  );
}
