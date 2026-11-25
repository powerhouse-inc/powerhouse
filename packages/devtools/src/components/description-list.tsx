import type { ReactNode } from "react";
import { cn } from "../lib/cn.js";

export type Description = readonly [term: ReactNode, value: ReactNode];

export function DescriptionList({
  rows,
  className,
}: {
  rows: readonly Description[];
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid grid-cols-[minmax(6.5rem,auto)_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13px]",
        className,
      )}
    >
      {rows.map(([term, value], i) => (
        <div key={i} className="contents">
          <dt className="text-muted-foreground">{term}</dt>
          <dd className="min-w-0 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
