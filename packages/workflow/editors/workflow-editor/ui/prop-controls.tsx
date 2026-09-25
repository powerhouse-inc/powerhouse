// Controls for Activepieces prop types and display hints that PropertyForm
// renders beyond plain inputs: callouts, steppers, date ranges, cards, colour.
import type { ReactNode } from "react";
import {
  IconButton,
  invalidClass,
  Select,
  textInputClass,
} from "../../shared/controls.js";
import { Icon, isIconName } from "../../shared/icons.js";
import type { FormOption } from "./forms.js";
import { hasExpressions } from "./expression-tokens.js";

// ─── markdown ───────────────────────────────────────────────────────────────

const CALLOUT: Record<string, { box: string; icon?: "alert" | "bolt" }> = {
  INFO: { box: "rounded bg-muted px-2 py-1.5" },
  WARNING: {
    box: "rounded border border-solid border-wf-warn/40 bg-wf-warn/10 px-2 py-1.5",
    icon: "alert",
  },
  TIP: {
    box: "rounded border border-solid border-wf-ok/30 bg-wf-ok/10 px-2 py-1.5",
    icon: "bolt",
  },
  BORDERLESS: { box: "" },
};

/** A MARKDOWN prop's text, styled by the piece's `variant` (INFO default). */
export function MarkdownCallout(props: {
  variant?: string;
  children: ReactNode;
}) {
  const callout = CALLOUT[props.variant ?? "INFO"] ?? CALLOUT.INFO;
  return (
    <div
      className={`flex gap-2 ${callout.box}`}
      data-variant={props.variant ?? "INFO"}
    >
      {callout.icon ? (
        <Icon
          name={callout.icon}
          className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
            callout.icon === "alert" ? "text-wf-warn" : "text-wf-ok"
          }`}
        />
      ) : null}
      <div className="min-w-0 flex-1">{props.children}</div>
    </div>
  );
}

// ─── options ────────────────────────────────────────────────────────────────

/** An option's icon, when the piece names one this editor draws. */
export function optionIcon(name: string | undefined): ReactNode {
  return isIconName(name) ? (
    <Icon name={name} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
  ) : undefined;
}

/** STATIC_DROPDOWN with `display: 'cards'`: one selectable card per option. */
export function OptionCards(props: {
  id: string;
  options: FormOption[];
  value: unknown;
  keyOf: (value: unknown) => string;
  onChange: (value: unknown) => void;
  invalid: boolean;
  clearable: boolean;
}) {
  const current = props.keyOf(props.value);
  return (
    <div
      id={props.id}
      role="radiogroup"
      className={`grid grid-cols-2 gap-2 ${props.invalid ? "rounded-md ring-1 ring-wf-warn/60" : ""}`}
    >
      {props.options.map((option) => {
        const key = props.keyOf(option.value);
        const selected = key === current;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={selected}
            className={`flex min-w-0 flex-col items-start gap-1 rounded-lg border border-solid p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${
              selected
                ? "border-foreground/40 bg-accent"
                : "border-foreground/10 hover:border-foreground/25"
            }`}
            onClick={() =>
              props.onChange(
                selected && props.clearable ? undefined : option.value,
              )
            }
          >
            <span className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">
              {optionIcon(option.icon)}
              {option.label}
            </span>
            {option.description ? (
              <span className="text-xs leading-snug text-muted-foreground">
                {option.description}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

// ─── number ─────────────────────────────────────────────────────────────────

/** The declared bounds, for the hint and the check: "Between 0 and 5". */
export function numberRangeText(min?: number, max?: number): string | null {
  if (min !== undefined && max !== undefined)
    return `Between ${min} and ${max}`;
  if (min !== undefined) return `At least ${min}`;
  if (max !== undefined) return `At most ${max}`;
  return null;
}

export function numberRangeError(
  value: unknown,
  min?: number,
  max?: number,
): string | null {
  if (typeof value !== "number") return null;
  if (
    (min !== undefined && value < min) ||
    (max !== undefined && value > max)
  ) {
    return `${numberRangeText(min, max)}.`;
  }
  return null;
}

/** NUMBER with `display: 'stepper'`: − value +, still accepting expressions. */
export function NumberStepper(props: {
  id: string;
  value: unknown;
  min?: number;
  max?: number;
  step?: number;
  invalid: boolean;
  onCommit: (value: unknown) => void;
  onFocus?: (event: { currentTarget: Element }) => void;
}) {
  const step = props.step ?? 1;
  const numeric = typeof props.value === "number" ? props.value : undefined;
  const clamp = (next: number) =>
    Math.min(props.max ?? Infinity, Math.max(props.min ?? -Infinity, next));
  const bump = (direction: 1 | -1) =>
    props.onCommit(clamp((numeric ?? props.min ?? 0) + direction * step));
  const text =
    props.value === undefined || props.value === null
      ? ""
      : String(props.value);
  return (
    <div className="flex items-center gap-1">
      <IconButton
        icon="minus"
        label="Decrease"
        disabled={
          numeric !== undefined &&
          props.min !== undefined &&
          numeric <= props.min
        }
        onClick={() => bump(-1)}
      />
      <input
        id={props.id}
        key={text}
        className={`${textInputClass} w-24 text-center tabular-nums ${props.invalid ? invalidClass : ""}`}
        defaultValue={text}
        inputMode="decimal"
        spellCheck={false}
        onFocus={props.onFocus}
        onBlur={(event) => {
          const raw = event.target.value.trim();
          if (raw === "") return props.onCommit(undefined);
          if (hasExpressions(raw)) return props.onCommit(raw);
          const parsed = Number(raw);
          props.onCommit(Number.isFinite(parsed) ? parsed : raw);
        }}
      />
      <IconButton
        icon="plus"
        label="Increase"
        disabled={
          numeric !== undefined &&
          props.max !== undefined &&
          numeric >= props.max
        }
        onClick={() => bump(1)}
      />
    </div>
  );
}

// ─── date range ─────────────────────────────────────────────────────────────

export interface DateRangeValue {
  preset?: string;
  after?: string;
  before?: string;
}

// The framework's DateRangePreset values, in its order.
const DATE_PRESETS: { value: string; label: string }[] = [
  { value: "any_time", label: "Any time" },
  { value: "last_24_hours", label: "Last 24 hours" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "last_90_days", label: "Last 90 days" },
  { value: "this_month", label: "This month" },
  { value: "custom", label: "Custom" },
];

function toLocalInput(iso: string | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInput(local: string): string | undefined {
  if (!local) return undefined;
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function asDateRange(value: unknown): DateRangeValue {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as DateRangeValue)
    : {};
}

// DATE_RANGE: a preset, or a custom after/before pair; commits the object the
// framework resolves, never a string.
export function DateRangeField(props: {
  id: string;
  value: unknown;
  dropdown: boolean;
  invalid: boolean;
  clearable: boolean;
  onCommit: (value: DateRangeValue | undefined) => void;
}) {
  const range = asDateRange(props.value);
  const setPreset = (preset: string) =>
    props.onCommit(
      preset === ""
        ? undefined
        : preset === "custom"
          ? { preset, after: range.after, before: range.before }
          : { preset },
    );
  return (
    <div className="flex flex-col gap-2">
      {props.dropdown ? (
        <Select
          id={props.id}
          options={DATE_PRESETS}
          value={range.preset ?? ""}
          onChange={setPreset}
          invalid={props.invalid}
          clearable={props.clearable}
          placeholder="Choose a range"
        />
      ) : (
        <div id={props.id} role="radiogroup" className="flex flex-wrap gap-1.5">
          {DATE_PRESETS.map((preset) => {
            const selected = range.preset === preset.value;
            return (
              <button
                key={preset.value}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`h-7 rounded-full border border-solid px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${
                  selected
                    ? "border-foreground bg-foreground text-background"
                    : "border-foreground/15 text-muted-foreground hover:text-foreground"
                }`}
                onClick={() =>
                  setPreset(selected && props.clearable ? "" : preset.value)
                }
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      )}
      {range.preset === "custom" ? (
        <div className="grid grid-cols-2 gap-2">
          {(["after", "before"] as const).map((edge) => (
            <label
              key={edge}
              className="flex flex-col gap-1 text-xs text-muted-foreground"
            >
              {edge === "after" ? "From" : "To"}
              <input
                type="datetime-local"
                className={textInputClass}
                defaultValue={toLocalInput(range[edge])}
                onBlur={(event) =>
                  props.onCommit({
                    ...range,
                    [edge]: fromLocalInput(event.target.value),
                  })
                }
              />
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ─── colour ─────────────────────────────────────────────────────────────────

const HEX = /^#[0-9a-f]{6}$/i;

/** COLOR: a swatch picker beside a text field that also takes expressions. */
export function ColorField(props: {
  id: string;
  value: unknown;
  invalid: boolean;
  onCommit: (value: unknown) => void;
  onFocus?: (event: { currentTarget: Element }) => void;
}) {
  const text = typeof props.value === "string" ? props.value : "";
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        aria-label="Pick a colour"
        className="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-solid border-foreground/15 bg-card p-1"
        value={HEX.test(text) ? text : "#000000"}
        onChange={(event) => props.onCommit(event.target.value)}
      />
      <input
        id={props.id}
        key={text}
        className={`${textInputClass} font-mono text-xs ${props.invalid ? invalidClass : ""}`}
        defaultValue={text}
        placeholder="#1d63d6 or {{steps.…}}"
        spellCheck={false}
        onFocus={props.onFocus}
        onBlur={(event) => {
          const raw = event.target.value.trim();
          props.onCommit(raw === "" ? undefined : raw);
        }}
      />
    </div>
  );
}

// ─── rich text ──────────────────────────────────────────────────────────────

// The framework's convention for a RICH_TEXT prop's `formatProperty` sibling.
export function richTextMode(format: unknown): "plain" | "markdown" | "html" {
  const value = typeof format === "string" ? format.toLowerCase() : "";
  if (value === "html") return "html";
  if (value === "markdown" || value === "md") return "markdown";
  return "plain";
}
