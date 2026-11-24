import { ChevronDown } from "lucide-react";
import {
  useId,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import { FOCUS_CLASS, StatusDot, type Tone } from "../kit.js";
import { cn } from "../lib/cn.js";
import type { DevtoolsLocation } from "../shell/location.js";
import { useShell } from "../shell/state.js";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "../ui/command.js";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover.js";

export function Split({
  list,
  detail,
  className,
  wide = false,
}: {
  list: ReactNode;
  detail: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid min-w-0 grid-cols-1 border-t @3xl:divide-x",
        wide
          ? "@3xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]"
          : "@3xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]",
        className,
      )}
    >
      <div className="min-w-0 pt-1 @3xl:pr-3">{list}</div>
      <div className="min-w-0 border-t pt-3 @3xl:border-t-0 @3xl:pl-4">
        {detail}
      </div>
    </div>
  );
}

export function Row({
  selected,
  onSelect,
  rowRef,
  className,
  children,
  label,
  ...data
}: {
  selected: boolean;
  onSelect: () => void;
  rowRef?: Ref<HTMLDivElement>;
  className?: string;
  children: ReactNode;
  label?: string;
} & { [k: `data-${string}`]: string | undefined }) {
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
      ref={rowRef}
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
        selected && FOCUS_CLASS,
        className,
      )}
    >
      {children}
    </div>
  );
}

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

export function GroupLabel({
  children,
  count,
  actions,
}: {
  children: ReactNode;
  count?: number;
  actions?: ReactNode;
}) {
  return (
    <div className="flex min-h-7 items-center gap-1.5 px-2 pt-2 text-[12px] text-muted-foreground">
      {children}
      {count !== undefined && <span className="tabular-nums">{count}</span>}
      {actions && <span className="ml-auto flex items-center">{actions}</span>}
    </div>
  );
}

export function Facts({
  rows,
  className,
}: {
  rows: [ReactNode, ReactNode][];
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid grid-cols-[minmax(6.5rem,auto)_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[13px]",
        className,
      )}
    >
      {rows.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DetailHeader({
  title,
  meta,
  status,
  actions,
}: {
  title: ReactNode;
  meta?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 pb-2.5">
      <h3 className="min-w-0 text-[14px] font-medium break-all">{title}</h3>
      {meta && (
        <span className="min-w-0 truncate font-mono text-[12px] text-muted-foreground">
          {meta}
        </span>
      )}
      {status}
      {actions && (
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {actions}
        </div>
      )}
    </header>
  );
}

export const includesSearch = (texts: readonly string[], search: string) => {
  const needle = search.trim().toLowerCase();
  return texts.some((text) => text.toLowerCase().includes(needle));
};

export function Switcher<T>({
  items,
  selected,
  itemKey,
  name,
  searchText,
  onSelect,
  renderItem,
  tooltip,
  searchLabel,
  noMatch,
  testId,
  itemData,
  className,
}: {
  items: readonly T[];
  selected: T;
  itemKey: (item: T) => string;
  name: (item: T) => string;
  searchText: (item: T) => string[];
  onSelect: (item: T) => void;
  renderItem: (item: T) => ReactNode;
  tooltip: string;
  searchLabel: string;
  noMatch: ReactNode;
  testId: string;
  itemData?: (item: T) => { [k: `data-${string}`]: string };
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selectedKey = itemKey(selected);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            data-testid={`${testId}-switcher`}
            title={tooltip}
            className={cn(
              "-mx-1.5 flex min-w-0 cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 aria-expanded:bg-muted",
              className,
            )}
          >
            <span
              data-testid={`${testId}-name`}
              className="min-w-0 break-words"
            >
              {name(selected)}
            </span>
            <ChevronDown
              aria-hidden
              className="size-4 shrink-0 text-muted-foreground"
            />
          </button>
        }
      />
      <PopoverContent className="w-80 max-w-[90vw]">
        <Command
          className="rounded-lg! p-0"
          filter={(_key, search, keywords = []) =>
            includesSearch(keywords, search) ? 1 : 0
          }
        >
          <CommandInput
            placeholder={searchLabel}
            aria-label={searchLabel}
            data-testid={`${testId}-search`}
          />
          <CommandList className="p-1">
            <CommandEmpty className="py-4 text-[12px] text-muted-foreground">
              {noMatch}
            </CommandEmpty>
            {items.map((item) => {
              const key = itemKey(item);
              return (
                <CommandItem
                  key={key}
                  value={key}
                  keywords={searchText(item)}
                  data-checked={key === selectedKey}
                  data-testid={`${testId}-option`}
                  {...itemData?.(item)}
                  onSelect={() => {
                    setOpen(false);
                    onSelect(item);
                  }}
                  className="items-start py-1.5 text-xs"
                >
                  {renderItem(item)}
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function SubHead({
  children,
  actions,
}: {
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mt-3 flex min-h-7 items-center gap-2 border-t pt-2.5 text-[12px] text-muted-foreground">
      <span>{children}</span>
      {actions && <span className="ml-auto flex gap-1.5">{actions}</span>}
    </div>
  );
}

export function TextButton({
  onClick,
  children,
  ...data
}: {
  onClick: () => void;
  children: ReactNode;
} & { [k: `data-${string}`]: string | undefined }) {
  return (
    <button
      type="button"
      {...data}
      onClick={onClick}
      className="cursor-pointer text-[12px] text-muted-foreground underline decoration-foreground/20 underline-offset-[3px] hover:text-foreground hover:decoration-foreground"
    >
      {children}
    </button>
  );
}

export const MARK_TEXT: Record<Tone, string> = {
  ok: "text-foreground",
  info: "text-foreground",
  idle: "text-muted-foreground",
  warn: "text-warning",
  error: "text-destructive",
};

export type Status = { word: string; tone: Tone; detail?: string };

export function StatusMark({
  status,
  className,
}: {
  status: Status;
  className?: string;
}) {
  return (
    <span
      title={status.detail}
      className={cn(
        "inline-flex min-w-0 flex-none items-center gap-1.5 text-[12px] whitespace-nowrap",
        MARK_TEXT[status.tone],
        className,
      )}
    >
      <StatusDot
        tone={status.tone}
        pulse={status.tone === "info"}
        className="size-1.5"
      />
      {status.word}
    </span>
  );
}

const locationKey = ({ panel, tab, focus }: DevtoolsLocation) =>
  JSON.stringify([panel, tab, focus?.kind, focus?.id]);

export function usePick<T>(): [T | undefined, (value: T) => void] {
  const at = locationKey(useShell().location);
  const [pick, setPick] = useState<{ at: string; value: T }>();
  if (pick && pick.at !== at) setPick(undefined);
  return [
    pick?.at === at ? pick.value : undefined,
    (value) => setPick({ at, value }),
  ];
}

export type TabItem<T extends string> = {
  id: T;
  label: ReactNode;
  /** Beside the label: a count, a mark. */
  aside?: ReactNode;
  /** The tab's accessible name, when the aside does not read well. */
  ariaLabel?: string;
};

const TAB_KEYS: Record<string, (index: number, count: number) => number> = {
  ArrowRight: (index, count) => (index + 1) % count,
  ArrowLeft: (index, count) => (index - 1 + count) % count,
  Home: () => 0,
  End: (_, count) => count - 1,
};

/** A tab strip and the panel of the chosen tab. The arrow keys, Home and End
 * move between tabs and choose the one they land on. */
export function Tabs<T extends string>({
  label,
  tabs,
  selected,
  onSelect,
  children,
  tabTestId,
  panelClassName,
}: {
  label: string;
  tabs: readonly TabItem<T>[];
  selected: T;
  onSelect: (id: T) => void;
  /** The panel of the selected tab. */
  children: ReactNode;
  tabTestId?: string;
  panelClassName?: string;
}) {
  const base = useId();
  const tabId = (id: T) => `${base}-tab-${id}`;
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const move = TAB_KEYS[e.key];
    const index = tabs.findIndex((tab) => tab.id === selected);
    if (!move || index < 0) return;
    e.preventDefault();
    const next = tabs[move(index, tabs.length)];
    onSelect(next.id);
    // The tab's own root: a shadow root when a host mounts DevTools in one.
    const root = e.currentTarget.getRootNode() as Document | ShadowRoot;
    root.getElementById(tabId(next.id))?.focus();
  };
  return (
    <>
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKey}
        className="flex gap-4 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0] shadow-border"
      >
        {tabs.map((tab) => {
          const isSelected = tab.id === selected;
          return (
            <button
              key={tab.id}
              id={tabId(tab.id)}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-controls={`${base}-panel`}
              aria-label={tab.ariaLabel}
              tabIndex={isSelected ? 0 : -1}
              data-testid={tabTestId}
              data-tab={tab.id}
              onClick={() => onSelect(tab.id)}
              className={cn(
                "inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 border-b-2 border-transparent text-[13px] text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground focus-visible:underline focus-visible:underline-offset-4",
                isSelected && "border-primary text-foreground",
              )}
            >
              {tab.label}
              {tab.aside}
            </button>
          );
        })}
      </div>
      <div
        id={`${base}-panel`}
        role="tabpanel"
        aria-labelledby={tabId(selected)}
        className={cn("min-w-0 pt-3", panelClassName)}
      >
        {children}
      </div>
    </>
  );
}
