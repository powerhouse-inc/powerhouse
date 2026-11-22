import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Field styling tokens. `FIELD` is an always-visible card-surface input that
 * reads clearly on both card and accent surfaces. `PLAIN` is for editable
 * display text (titles, sentence fragments): borderless until hover/focus.
 */
const FIELD =
  "rounded border border-border bg-card px-2 py-1 outline-none transition-colors focus:border-muted-foreground focus:ring-1 focus:ring-border";
const PLAIN =
  "rounded border border-transparent bg-transparent px-1 py-0.5 outline-none transition-colors hover:border-border focus:border-muted-foreground focus:bg-card";

export type FieldVariant = "field" | "plain";

/** Uppercase section label with an optional right-aligned action. */
export function Section({
  title,
  action,
  accent = false,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h4
          className={`text-xs font-semibold tracking-wide uppercase ${accent ? "text-vetra-primary" : "text-muted-foreground"}`}
        >
          {title}
        </h4>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A subtle text-link button, used for cancel/clear/commit affordances. */
export function LinkButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="text-sm text-foreground underline-offset-2 hover:underline disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** Ghost button for "Clear / Unlink …" section actions. */
export function ClearButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1 rounded-sm border border-transparent bg-transparent px-2 py-0.5 text-sm text-foreground hover:border-border hover:bg-accent disabled:opacity-40"
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M15 9l-6 6M9 9l6 6" />
      </svg>
      {children}
    </button>
  );
}

/** Ghost button for "Add …" section actions. */
export function AddButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1 rounded-sm border border-transparent bg-transparent px-2 py-0.5 text-sm text-foreground hover:border-border hover:bg-accent disabled:opacity-40"
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M12 8v8M8 12h8" />
      </svg>
      {children}
    </button>
  );
}

/** A small remove (×) button. */
export function RemoveButton({
  onClick,
  label = "Remove",
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="text-border hover:text-destructive"
    >
      ×
    </button>
  );
}

/** Faint placeholder line for empty collections. */
export function EmptyHint({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

/** Read-only chip used to render enum values / tags. */
export function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "prefer" | "avoid" | "info";
}) {
  const toneClass =
    tone === "prefer"
      ? "bg-success/10 text-success"
      : tone === "avoid"
        ? "bg-destructive/10 text-destructive"
        : tone === "info"
          ? "bg-info/10 text-info"
          : "bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${toneClass}`}
    >
      {children}
    </span>
  );
}

/** Set a textarea's height to fit its content (border-box aware). */
function fitToContent(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  const cs = window.getComputedStyle(el);
  const border =
    parseFloat(cs.borderTopWidth || "0") +
    parseFloat(cs.borderBottomWidth || "0");
  el.style.height = `${el.scrollHeight + border}px`;
}

/**
 * Multi-line textarea with a definite width that wraps its text and grows
 * vertically to fit — no inner scrollbar, no resize handle. Height is driven
 * off scrollHeight on every value change, and recomputed when the available
 * width changes (responsive / pane resize).
 */
function AutoTextarea({
  value,
  placeholder,
  onChange,
  onBlur,
  onEscape,
  className,
}: {
  value: string;
  placeholder: string;
  onChange: (next: string) => void;
  onBlur: () => void;
  onEscape: () => void;
  className: string;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    if (ref.current) fitToContent(ref.current);
  }, [value]);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let lastWidth = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== lastWidth) {
        lastWidth = el.clientWidth;
        fitToContent(el);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <textarea
      ref={ref}
      value={value}
      placeholder={placeholder}
      rows={1}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          onEscape();
          e.currentTarget.blur();
        }
      }}
      className={`block w-full resize-none overflow-hidden ${className}`}
    />
  );
}

/**
 * Inline-editable text. Keeps a local draft while focused and commits the
 * trimmed draft on blur / Enter when it differs from the value. `variant`
 * picks the look: `field` (white input, default), `plain` (borderless display
 * text), or `inline` (auto-width, for sentence fragments). When `required`, an
 * empty draft is discarded rather than committed.
 */
export function EditableText({
  value,
  placeholder,
  onCommit,
  multiline = false,
  required = false,
  variant = "field",
  width = "w-full",
  className = "",
}: {
  value: string | null | undefined;
  placeholder: string;
  onCommit: (next: string) => void;
  multiline?: boolean;
  required?: boolean;
  variant?: FieldVariant;
  /** Tailwind width class — fixed or percentage. Defaults to full width. */
  width?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(value ?? "");
  // eslint-disable-next-line react-hooks-extra/set-state-in-effect
  useEffect(() => setDraft(value ?? ""), [value]);

  const commit = () => {
    const next = draft.trim();
    if (next === (value ?? "").trim()) return;
    if (required && !next) {
      setDraft(value ?? "");
      return;
    }
    onCommit(next);
  };
  const reset = () => setDraft(value ?? "");
  const base = variant === "field" ? FIELD : PLAIN;

  if (multiline) {
    return (
      <div className={width}>
        <AutoTextarea
          value={draft}
          placeholder={placeholder}
          onChange={setDraft}
          onBlur={commit}
          onEscape={reset}
          className={`${base} ${className}`}
        />
      </div>
    );
  }

  return (
    <input
      type="text"
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          reset();
          e.currentTarget.blur();
        }
      }}
      className={`${width} ${base} ${className}`}
    />
  );
}

/** Inline-editable integer with optional bounds; commits on blur. */
export function EditableNumber({
  value,
  placeholder,
  onCommit,
  min,
  max,
  className = "",
}: {
  value: number | null | undefined;
  placeholder?: string;
  onCommit: (next: number) => void;
  min?: number;
  max?: number;
  className?: string;
}) {
  const [draft, setDraft] = useState(value?.toString() ?? "");
  // eslint-disable-next-line react-hooks-extra/set-state-in-effect
  useEffect(() => setDraft(value?.toString() ?? ""), [value]);

  const commit = () => {
    if (draft.trim() === "") return;
    let n = Number(draft);
    if (Number.isNaN(n)) {
      setDraft(value?.toString() ?? "");
      return;
    }
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    if (n !== value) onCommit(n);
    setDraft(n.toString());
  };

  return (
    <input
      type="number"
      value={draft}
      placeholder={placeholder}
      min={min}
      max={max}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className={`${FIELD} text-right ${className}`}
    />
  );
}

export type SelectOption<T extends string> = { value: T; label: string };

/**
 * Strongly-typed select. Options may be raw enum values or {value,label}
 * pairs; `onChange` always receives the enum type, so call sites stay typed.
 */
export function Select<T extends string>({
  value,
  options,
  onChange,
  className = "",
}: {
  value: T;
  options: readonly T[] | readonly SelectOption<T>[];
  onChange: (next: T) => void;
  className?: string;
}) {
  const normalized: readonly SelectOption<T>[] = options.map((o) =>
    typeof o === "string" ? { value: o, label: titleCase(o) } : o,
  );
  return (
    <select
      value={value}
      onChange={(e) => {
        const next = normalized.find((o) => o.value === e.target.value);
        if (next) onChange(next.value);
      }}
      className={`rounded-sm border border-border bg-card px-1.5 py-1 text-sm transition-colors outline-none focus:border-muted-foreground focus:ring-1 focus:ring-border ${className}`}
    >
      {normalized.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Render an enum value as readable Title Case ("MARKET_MVP" → "Market mvp"). */
export function titleCase(value: string): string {
  const s = value.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Editable list of short string values rendered as removable chips, with an
 * inline input to append new ones. Commits the whole array on every change.
 */
export function ChipList({
  items,
  onChange,
  placeholder,
  tone = "neutral",
}: {
  items: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  tone?: "neutral" | "prefer" | "avoid";
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const value = draft.trim();
    if (value && !items.includes(value)) onChange([...items, value]);
    setDraft("");
  };

  const toneClass =
    tone === "prefer"
      ? "bg-success/10 text-success"
      : tone === "avoid"
        ? "bg-destructive/10 text-destructive"
        : "bg-muted text-foreground";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${toneClass}`}
        >
          {item}
          <button
            type="button"
            aria-label={`Remove ${item}`}
            onClick={() => onChange(items.filter((i) => i !== item))}
            className="text-current opacity-50 hover:opacity-100"
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={add}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          }
        }}
        className="min-w-28 flex-1 rounded-sm border border-border bg-card px-1.5 py-0.5 text-xs transition-colors outline-none focus:border-muted-foreground focus:ring-1 focus:ring-border"
      />
    </div>
  );
}

/**
 * Toggle set of enum values rendered as selectable chips. Used for multi-value
 * enum fields (e.g. a task's kinds). Commits the whole array on every toggle.
 */
export function EnumChips<T extends string>({
  options,
  selected,
  onChange,
}: {
  options: readonly T[];
  selected: T[];
  onChange: (next: T[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const on = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() =>
              onChange(
                on ? selected.filter((s) => s !== opt) : [...selected, opt],
              )
            }
            className={`rounded-full px-2 py-0.5 text-xs ${
              on
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:bg-border/40"
            }`}
          >
            {titleCase(opt)}
          </button>
        );
      })}
    </div>
  );
}

/** Labeled field wrapper for sidebar / header layouts. */
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}

/** A bordered card used for collection items. */
export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border border-border bg-card p-4 ${className}`}>
      {children}
    </div>
  );
}
