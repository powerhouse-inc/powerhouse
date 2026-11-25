import type { KeyboardEvent, ReactNode, Ref } from "react";
import { cn } from "../lib/cn.js";
import type { DataAttributes } from "../lib/data-attributes.js";

/** A list of rows to choose one from. The arrow keys move the choice. */
export function Rows({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="listbox"
      aria-label={label}
      data-rows=""
      className={cn("min-w-0", className)}
    >
      {children}
    </div>
  );
}

export function Row({
  selected,
  onSelect,
  ref,
  className,
  children,
  label,
  ...data
}: {
  selected: boolean;
  onSelect: () => void;
  ref?: Ref<HTMLDivElement>;
  className?: string;
  children: ReactNode;
  label?: string;
} & DataAttributes) {
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const rows = [
      ...(e.currentTarget
        .closest("[data-rows]")
        ?.querySelectorAll<HTMLElement>("[data-row]") ?? []),
    ];
    const i = rows.indexOf(e.currentTarget);
    const next = rows[i + (e.key === "ArrowDown" ? 1 : -1)];
    next?.focus();
    next?.click();
  };
  return (
    <div
      ref={ref}
      role="option"
      tabIndex={0}
      aria-selected={selected}
      aria-label={label}
      data-row=""
      {...data}
      onClick={onSelect}
      onKeyDown={onKey}
      className={cn(
        "grid min-h-7 cursor-pointer items-center gap-x-3 rounded-md px-2 text-[13px] outline-none hover:bg-muted/50 focus-visible:bg-muted/60",
        selected && "bg-primary/20 text-foreground hover:bg-primary/25",
        className,
      )}
    >
      {children}
    </div>
  );
}
