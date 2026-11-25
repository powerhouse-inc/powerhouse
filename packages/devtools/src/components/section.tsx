import { useId, type ReactNode, type Ref } from "react";
import { cn } from "../lib/cn.js";
import type { DataAttributes } from "../lib/data-attributes.js";

/** The sections of a page, one under another, 28px apart. */
export function Sections({
  children,
  className,
  ...data
}: { children: ReactNode; className?: string } & DataAttributes) {
  return (
    <div {...data} className={cn("flex min-w-0 flex-col gap-7", className)}>
      {children}
    </div>
  );
}

/** A part of a page: its title, with tabs and actions beside it, over its
 * content. `Sections` spaces it from the next. */
export function Section({
  title,
  tabs,
  actions,
  children,
  className,
  ref,
  ...data
}: {
  title: ReactNode;
  /** Tabs that choose what the section shows, beside its title. */
  tabs?: ReactNode;
  /** At the end of the header: a count, a switch. */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  ref?: Ref<HTMLElement>;
} & DataAttributes) {
  const titleId = useId();
  return (
    <section
      ref={ref}
      aria-labelledby={titleId}
      {...data}
      className={cn("min-w-0", className)}
    >
      <header className="flex min-h-7 flex-wrap items-center gap-x-3 gap-y-1">
        <h3
          id={titleId}
          className="min-w-0 text-[13px] font-medium break-words"
        >
          {title}
        </h3>
        {tabs}
        {actions && (
          <div className="ml-auto flex min-w-0 items-center gap-2 text-[12px] text-muted-foreground">
            {actions}
          </div>
        )}
      </header>
      <div className="pt-2">{children}</div>
    </section>
  );
}

/** The title of a part within a section, or of a group in a list. One style
 * for every level below a section's title. */
export function SectionLabel({
  as: Element = "h4",
  children,
  actions,
  className,
}: {
  as?: "h3" | "h4" | "h5" | "div" | "span";
  children: ReactNode;
  /** At the end of the line: a count, a link to the file. */
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <Element
      className={cn(
        "flex min-h-5 min-w-0 items-center gap-2 text-[12px] font-medium text-muted-foreground",
        className,
      )}
    >
      {children}
      {actions && (
        <span className="ml-auto flex min-w-0 items-center gap-1.5 font-normal">
          {actions}
        </span>
      )}
    </Element>
  );
}

/** A block within a section under its own label: Schema, Input, SDL. */
export function Subsection({
  title,
  as = "h4",
  actions,
  children,
  className,
}: {
  title: ReactNode;
  /** The label's heading level: one below the heading it sits under. */
  as?: "h3" | "h4" | "h5";
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <SectionLabel as={as} actions={actions} className="mb-1.5">
        {title}
      </SectionLabel>
      {children}
    </div>
  );
}
