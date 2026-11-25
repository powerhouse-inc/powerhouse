import { useId, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "../lib/cn.js";
import type { DataAttributes } from "../lib/data-attributes.js";
import { TONE_TEXT, type Tone } from "./status.js";

export type TabItem<T extends string> = {
  id: T;
  label: ReactNode;
  /** Beside the label: a `TabCount`, a mark. */
  aside?: ReactNode;
  /** The tab's accessible name, when the aside does not read well. */
  ariaLabel?: string;
  data?: DataAttributes;
};

const tabId = (base: string, id: string) => `${base}-tab-${id}`;

/** The props of the panel that tabs with ids from `base` control. */
export const tabPanelProps = (base: string, selected: string) =>
  ({
    id: base,
    role: "tabpanel",
    "aria-labelledby": tabId(base, selected),
  }) as const;

const TAB_KEYS: Partial<
  Record<string, (index: number, count: number) => number>
> = {
  ArrowRight: (index, count) => (index + 1) % count,
  ArrowLeft: (index, count) => (index - 1 + count) % count,
  Home: () => 0,
  End: (_, count) => count - 1,
};

/** The props of a tab in a list whose ids start with `base`, chosen with a
 * click, and with the arrow keys, Home and End from the tab that has focus. */
export function tabProps<T extends string>(
  base: string,
  ids: readonly T[],
  id: T,
  selected: T,
  onSelect: (id: T) => void,
) {
  const isSelected = id === selected;
  return {
    id: tabId(base, id),
    role: "tab",
    "aria-selected": isSelected,
    "aria-controls": base,
    tabIndex: isSelected ? 0 : -1,
    onClick: () => onSelect(id),
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      // Alt+Arrow is the browser's Back and Forward.
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const move = TAB_KEYS[e.key];
      const index = ids.indexOf(selected);
      if (!move || index < 0) return;
      e.preventDefault();
      const next = ids[move(index, ids.length)];
      onSelect(next);
      // The tab's own root: a shadow root when a host mounts DevTools in one.
      const root = e.currentTarget.getRootNode() as Document | ShadowRoot;
      root.getElementById(tabId(base, next))?.focus();
    },
  } as const;
}

/** A count beside a tab's label; a problem count takes the problem's tone. */
export function TabCount({
  children,
  tone = "idle",
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return (
    <span
      aria-hidden
      className={cn("text-[11px] tabular-nums", TONE_TEXT[tone])}
    >
      {children}
    </span>
  );
}

/** A strip of tabs on a baseline that carries the chosen tab's mark. It
 * scrolls sideways when the tabs do not fit. */
export function TabList<T extends string>({
  label,
  tabs,
  selected,
  onSelect,
  panelId,
  className,
}: {
  label: string;
  tabs: readonly TabItem<T>[];
  selected: T;
  onSelect: (id: T) => void;
  /** The panel the tabs control, set up with `tabPanelProps(panelId, …)`.
   * Without one the tabs still get ids of their own. */
  panelId?: string;
  className?: string;
}) {
  const generated = useId();
  const base = panelId ?? generated;
  const ids = tabs.map((tab) => tab.id);
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        "no-scrollbar flex shrink-0 gap-4 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0] shadow-border",
        className,
      )}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          {...tabProps(base, ids, tab.id, selected, onSelect)}
          aria-controls={panelId}
          aria-label={tab.ariaLabel}
          data-tab={tab.id}
          {...tab.data}
          className={cn(
            "inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 border-b-2 border-transparent text-[13px] text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground focus-visible:underline focus-visible:underline-offset-4",
            tab.id === selected && "border-primary text-foreground",
          )}
        >
          {tab.label}
          {tab.aside}
        </button>
      ))}
    </div>
  );
}

/** A tab strip and the panel of the chosen tab. */
export function Tabs<T extends string>({
  label,
  tabs,
  selected,
  onSelect,
  children,
  panelClassName,
}: {
  label: string;
  tabs: readonly TabItem<T>[];
  selected: T;
  onSelect: (id: T) => void;
  /** The panel of the selected tab. */
  children: ReactNode;
  panelClassName?: string;
}) {
  const panelId = useId();
  return (
    <>
      <TabList
        label={label}
        tabs={tabs}
        selected={selected}
        onSelect={onSelect}
        panelId={panelId}
      />
      <div
        {...tabPanelProps(panelId, selected)}
        className={cn("min-w-0 pt-3", panelClassName)}
      >
        {children}
      </div>
    </>
  );
}
