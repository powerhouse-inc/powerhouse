// Form and action primitives for the workflow editors, drawn from Connect's
// theme tokens so they work in both themes.
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "./icons.js";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

// ─── buttons ────────────────────────────────────────────────────────────────

const BUTTON_SIZE = {
  sm: "h-7 gap-1 rounded-md px-2 text-xs",
  md: "h-8 gap-1.5 rounded-md px-3 text-[13px]",
};

const BUTTON_VARIANT = {
  primary: "bg-primary text-primary-foreground hover:opacity-90",
  secondary:
    "border border-solid border-foreground/15 bg-card text-foreground hover:bg-accent",
  ghost: "text-muted-foreground hover:bg-accent hover:text-foreground",
  danger: "text-wf-fail hover:bg-wf-fail/10",
};

export function Button(
  props: ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: keyof typeof BUTTON_VARIANT;
    size?: keyof typeof BUTTON_SIZE;
  },
) {
  const { variant = "secondary", size = "md", className = "", ...rest } = props;
  return (
    <button
      type="button"
      className={`inline-flex shrink-0 items-center font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${FOCUS_RING} ${BUTTON_SIZE[size]} ${BUTTON_VARIANT[variant]} ${className}`}
      {...rest}
    />
  );
}

export function IconButton(
  props: ButtonHTMLAttributes<HTMLButtonElement> & {
    icon: IconName;
    label: string;
    active?: boolean;
  },
) {
  const { icon, label, active, className = "", ...rest } = props;
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-50 ${FOCUS_RING} ${
        active
          ? "bg-wf-run/10 text-wf-run"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      } ${className}`}
      {...rest}
    >
      <Icon name={icon} className="h-3.5 w-3.5" />
    </button>
  );
}

// ─── fields ─────────────────────────────────────────────────────────────────

export const inputClass =
  "w-full rounded-md border border-solid border-foreground/15 bg-card px-2.5 text-[13px] text-foreground placeholder:text-muted-foreground/70 transition-colors hover:border-foreground/25 focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-60";

export const textInputClass = `${inputClass} h-9`;
export const textAreaClass = `${inputClass} min-h-20 py-2 leading-relaxed`;
export const invalidClass = "border-wf-warn/70 hover:border-wf-warn";

/** Label row above a control: name, optional marker, and a trailing action. */
export function FieldLabel(props: {
  htmlFor?: string;
  label: ReactNode;
  optional?: boolean;
  needsValue?: boolean;
  action?: ReactNode;
}) {
  return (
    <div className="mb-1.5 flex min-h-6 items-center justify-between gap-2">
      <label
        htmlFor={props.htmlFor}
        className="flex min-w-0 items-baseline gap-1.5 text-[13px] font-medium text-foreground"
      >
        <span className="truncate">{props.label}</span>
        {props.optional ? (
          <span className="shrink-0 text-xs font-normal text-muted-foreground">
            Optional
          </span>
        ) : null}
        {props.needsValue ? (
          <span className="shrink-0 text-xs font-normal text-wf-warn">
            Needs a value
          </span>
        ) : null}
      </label>
      {props.action ? (
        <span className="flex shrink-0 items-center gap-0.5">
          {props.action}
        </span>
      ) : null}
    </div>
  );
}

const LONG_HINT = 140;

/** Help text under a control; long piece descriptions fold to two lines. */
export function Hint(props: { children?: ReactNode; text?: string }) {
  const [open, setOpen] = useState(false);
  const text = props.text;
  if (text !== undefined) {
    if (!text.trim()) return null;
    const long = text.length > LONG_HINT;
    return (
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
        <span className={long && !open ? "line-clamp-2" : undefined}>
          {text}
        </span>
        {long ? (
          <button
            type="button"
            className="mt-0.5 block font-medium text-foreground/70 hover:text-foreground"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? "Show less" : "Show more"}
          </button>
        ) : null}
      </p>
    );
  }
  return (
    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
      {props.children}
    </p>
  );
}

export function FieldError(props: { children?: ReactNode }) {
  if (!props.children) return null;
  return <p className="mt-1.5 text-xs text-wf-fail">{props.children}</p>;
}

export function Switch(props: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="min-w-0">
        <span className="block text-[13px] font-medium text-foreground">
          {props.label}
        </span>
        {props.description ? <Hint text={props.description} /> : null}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={props.checked}
        disabled={props.disabled}
        className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${FOCUS_RING} ${
          props.checked ? "bg-primary" : "bg-foreground/20"
        }`}
        onClick={() => props.onChange(!props.checked)}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-card shadow-sm transition-transform ${
            props.checked ? "translate-x-[18px]" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

// ─── tabs ───────────────────────────────────────────────────────────────────

export function Tabs<T extends string>(props: {
  value: T;
  onChange: (value: T) => void;
  tabs: { value: T; label: string; badge?: ReactNode }[];
}) {
  return (
    <div role="tablist" className="flex gap-4">
      {props.tabs.map((tab) => {
        const selected = tab.value === props.value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={selected}
            className={`-mb-px flex items-center gap-1.5 border-b-2 border-solid pb-2 text-[13px] font-medium transition-colors ${FOCUS_RING} ${
              selected
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => props.onChange(tab.value)}
          >
            {tab.label}
            {tab.badge}
          </button>
        );
      })}
    </div>
  );
}

// ─── segmented ──────────────────────────────────────────────────────────────

/** Two or three short, mutually exclusive choices shown side by side. */
export function Segmented(props: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  invalid?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      className={`flex h-9 w-full items-center gap-0.5 rounded-md bg-muted p-0.5 ${
        props.invalid ? "ring-1 ring-wf-warn/60" : ""
      }`}
    >
      {props.options.map((option) => {
        const selected = option.value === props.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            className={`h-8 min-w-0 flex-1 truncate rounded px-2 text-[13px] transition-colors ${FOCUS_RING} ${
              selected
                ? "bg-card font-medium text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => props.onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── select ─────────────────────────────────────────────────────────────────

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  disabled?: boolean;
}

// Past this many options the list gets a search box.
const SEARCH_THRESHOLD = 7;

interface SelectProps {
  options: SelectOption[];
  placeholder?: string;
  loading?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  // Reloads options from their source; shown in the list header.
  onRefresh?: () => void;
  emptyText?: string;
}

type SingleSelectProps = SelectProps & {
  multiple?: false;
  value: string;
  onChange: (value: string) => void;
  clearable?: boolean;
};

type MultiSelectProps = SelectProps & {
  multiple: true;
  value: string[];
  onChange: (value: string[]) => void;
};

// A listbox in a popover, portalled to the body so a scrolling side panel
// never clips it; searchable once the list is long.
export function Select(props: SingleSelectProps | MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [position, setPosition] = useState<{
    left: number;
    width: number;
    top?: number;
    bottom?: number;
    maxHeight: number;
  } | null>(null);

  const selected = props.multiple
    ? props.value
    : props.value
      ? [props.value]
      : [];
  const selectedSet = new Set(selected);
  const searchable = props.options.length > SEARCH_THRESHOLD;
  const needle = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      needle
        ? props.options.filter((option) =>
            `${option.label} ${option.description ?? ""}`
              .toLowerCase()
              .includes(needle),
          )
        : props.options,
    [needle, props.options],
  );

  const close = () => {
    setOpen(false);
    setQuery("");
    triggerRef.current?.focus();
  };

  const place = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const below = window.innerHeight - rect.bottom - 8;
    const above = rect.top - 8;
    const flip = below < 240 && above > below;
    setPosition({
      left: rect.left,
      width: rect.width,
      top: flip ? undefined : rect.bottom + 4,
      bottom: flip ? window.innerHeight - rect.top + 4 : undefined,
      maxHeight: Math.min(320, flip ? above : below),
    });
  };

  const openList = () => {
    const index = props.options.findIndex((option) =>
      selectedSet.has(option.value),
    );
    setActive(Math.max(0, index));
    setOpen(true);
  };

  useLayoutEffect(() => {
    if (!open) return;
    place();
    // Placed once per opening; scroll and resize re-place it below.
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (searchable) searchRef.current?.focus();
    else popoverRef.current?.focus();
    const onPointer = (event: MouseEvent) => {
      const target = event.target as globalThis.Node;
      if (
        !popoverRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        setOpen(false);
        setQuery("");
      }
    };
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, searchable]);

  useEffect(() => {
    popoverRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (option: SelectOption) => {
    if (option.disabled) return;
    if (props.multiple) {
      props.onChange(
        selectedSet.has(option.value)
          ? props.value.filter((value) => value !== option.value)
          : [...props.value, option.value],
      );
      return;
    }
    props.onChange(option.value);
    close();
  };

  const onListKey = (event: KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(visible.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = visible[active] as SelectOption | undefined;
      if (option) choose(option);
    } else if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      close();
    }
  };

  const labels = props.options
    .filter((option) => selectedSet.has(option.value))
    .map((option) => option.label);
  // A saved value the current options don't list still shows as itself.
  const unknown = selected.filter(
    (value) => !props.options.some((option) => option.value === value),
  );
  const shown = [...labels, ...unknown];
  const selectedIcon = props.multiple
    ? undefined
    : props.options.find((option) => option.value === props.value)?.icon;

  return (
    <>
      <button
        ref={triggerRef}
        id={props.id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-haspopup="listbox"
        disabled={props.disabled}
        className={`${textInputClass} flex items-center gap-2 text-left ${
          props.invalid ? invalidClass : ""
        } ${open ? "border-ring ring-2 ring-ring/25" : ""}`}
        onClick={() => (open ? close() : openList())}
        onKeyDown={(event) => {
          if (
            !open &&
            (event.key === "ArrowDown" ||
              event.key === "Enter" ||
              event.key === " ")
          ) {
            event.preventDefault();
            openList();
          }
        }}
      >
        {selectedIcon}
        <span
          className={`min-w-0 flex-1 truncate ${shown.length ? "" : "text-muted-foreground/70"}`}
        >
          {shown.length > 0
            ? shown.join(", ")
            : props.loading
              ? "Loading…"
              : (props.placeholder ?? "Choose…")}
        </span>
        {props.multiple && shown.length > 1 ? (
          <span className="shrink-0 rounded bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">
            {shown.length}
          </span>
        ) : null}
        <Icon
          name="chevronDown"
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && position
        ? createPortal(
            <div
              ref={popoverRef}
              tabIndex={-1}
              className="workflow-select-popover fixed flex flex-col overflow-hidden rounded-lg border border-solid border-foreground/10 bg-popover text-popover-foreground shadow-lg outline-none"
              style={{
                left: position.left,
                width: Math.max(position.width, 220),
                top: position.top,
                bottom: position.bottom,
                maxHeight: position.maxHeight,
              }}
              onKeyDown={onListKey}
            >
              {searchable || props.onRefresh ? (
                <div className="flex items-center gap-1 border-b border-solid border-foreground/10 px-2">
                  {searchable ? (
                    <>
                      <Icon
                        name="search"
                        className="h-3.5 w-3.5 text-muted-foreground"
                      />
                      <input
                        ref={searchRef}
                        className="h-9 min-w-0 flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
                        placeholder="Search"
                        value={query}
                        onChange={(event) => {
                          setQuery(event.target.value);
                          setActive(0);
                        }}
                      />
                    </>
                  ) : (
                    <span className="h-9 flex-1" />
                  )}
                  {props.onRefresh ? (
                    <IconButton
                      icon="retry"
                      label="Reload options"
                      disabled={props.loading}
                      onClick={props.onRefresh}
                    />
                  ) : null}
                </div>
              ) : null}
              <div
                id={listId}
                role="listbox"
                aria-multiselectable={props.multiple || undefined}
                className="min-h-0 flex-1 overflow-y-auto p-1"
              >
                {props.loading && props.options.length === 0 ? (
                  <p className="px-2 py-2 text-[13px] text-muted-foreground">
                    Loading options…
                  </p>
                ) : visible.length === 0 ? (
                  <p className="px-2 py-2 text-[13px] text-muted-foreground">
                    {needle
                      ? "Nothing matches."
                      : (props.emptyText ?? "No options.")}
                  </p>
                ) : (
                  visible.map((option, index) => {
                    const isSelected = selectedSet.has(option.value);
                    return (
                      <div
                        key={option.value}
                        role="option"
                        aria-selected={isSelected}
                        aria-disabled={option.disabled || undefined}
                        data-index={index}
                        className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] ${
                          index === active ? "bg-accent" : ""
                        } ${option.disabled ? "cursor-not-allowed opacity-50" : ""}`}
                        onMouseEnter={() => setActive(index)}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          choose(option);
                        }}
                      >
                        {props.multiple ? (
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border border-solid ${
                              isSelected
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-foreground/25"
                            }`}
                          >
                            {isSelected ? (
                              <Icon name="check" className="h-3 w-3" />
                            ) : null}
                          </span>
                        ) : null}
                        {option.icon}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{option.label}</span>
                          {option.description ? (
                            <span className="block truncate text-xs text-muted-foreground">
                              {option.description}
                            </span>
                          ) : null}
                        </span>
                        {!props.multiple && isSelected ? (
                          <Icon
                            name="check"
                            className="h-3.5 w-3.5 text-foreground"
                          />
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
              {!props.multiple && props.clearable && props.value ? (
                <div className="border-t border-solid border-foreground/10 p-1">
                  {
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-muted-foreground hover:bg-accent hover:text-foreground"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        props.onChange("");
                        close();
                      }}
                    >
                      <Icon name="close" className="h-3.5 w-3.5" />
                      Clear selection
                    </button>
                  }
                </div>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
