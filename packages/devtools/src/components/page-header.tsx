import type { ReactNode } from "react";
import { cn } from "../lib/cn.js";

/** The title of what a page shows, the chips beside it, its actions and the
 * line that describes it. */
export function PageHeader({
  title,
  children,
  actions,
  description,
  className,
}: {
  title: ReactNode;
  /** Beside the title: a version, the checks. */
  children?: ReactNode;
  actions?: ReactNode;
  description?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <header className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <h2 className="flex min-w-0 items-center text-[15px] font-semibold [overflow-wrap:anywhere]">
          {title}
        </h2>
        {children}
        {actions && (
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {actions}
          </div>
        )}
      </header>
      {description && (
        <p className="mt-1 text-[13px] text-pretty text-muted-foreground">
          {description}
        </p>
      )}
    </div>
  );
}
