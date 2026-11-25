import type { ProjectCheck } from "../api.js";
import { EmptyText, Prose } from "../components/text.js";
import { StatusDot, Tag, TONE_TEXT, type Tone } from "../components/status.js";
import { cn } from "../lib/cn.js";
import { plural } from "../lib/plural.js";

export type CheckState = ProjectCheck["state"];

const SEVERITY: Record<CheckState, number> = { pass: 0, warn: 1, fail: 2 };

/** Undefined for a module without checks. */
export function worstCheck(
  checks: readonly ProjectCheck[],
): CheckState | undefined {
  let worst: CheckState | undefined;
  for (const { state } of checks) {
    if (worst === undefined || SEVERITY[state] > SEVERITY[worst]) worst = state;
  }
  return worst;
}

export const problemsOf = (checks: readonly ProjectCheck[]): ProjectCheck[] =>
  checks.filter((check) => check.state !== "pass");

const CHECK_TONE: Record<CheckState, Tone> = {
  pass: "ok",
  warn: "warn",
  fail: "error",
};

/** The tone of a module's worst check; idle when it has none. */
export const checksTone = (checks: readonly ProjectCheck[]): Tone => {
  const worst = worstCheck(checks);
  return worst ? CHECK_TONE[worst] : "idle";
};

/** A module's checks in one chip: how many pass, or how many do not. */
export function ChecksTag({ checks }: { checks: readonly ProjectCheck[] }) {
  if (checks.length === 0) return null;
  const problems = problemsOf(checks);
  const tone = checksTone(checks);
  return (
    <Tag
      tone={tone}
      data-testid="ph-checks-summary"
      data-state={worstCheck(checks)}
      title={problems.map((check) => check.label).join("\n") || undefined}
      className="gap-1.5"
    >
      <StatusDot tone={tone} className="size-1.5" />
      {problems.length > 0
        ? plural(problems.length, "problem")
        : `${plural(checks.length, "check")} ${checks.length === 1 ? "passes" : "pass"}`}
    </Tag>
  );
}

export type CheckRow = {
  id: string;
  tone: Tone;
  label: string;
  detail?: string;
};

export const isProblem = (row: CheckRow) =>
  row.tone === "warn" || row.tone === "error";

export const checkRows = (checks: readonly ProjectCheck[]): CheckRow[] =>
  checks.map((check) => ({
    id: check.id,
    tone: CHECK_TONE[check.state],
    label: check.label,
    ...(check.state !== "pass" && check.detail && { detail: check.detail }),
  }));

/** Whether Connect loaded the module in this tab, as one more row. */
export const loadedRow = (loaded: boolean): CheckRow => ({
  id: "loaded",
  tone: loaded ? "ok" : "idle",
  label: loaded ? "Loaded in this tab" : "Not loaded in this tab",
});

export function Checks({ rows }: { rows: readonly CheckRow[] }) {
  if (rows.length === 0) return <EmptyText>None.</EmptyText>;
  return (
    <ul data-testid="ph-checks" className="space-y-1.5 text-[13px]">
      {rows.map((row) => (
        <li
          key={row.id}
          data-testid="ph-check"
          data-check={row.id}
          data-tone={row.tone}
          className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2"
        >
          <StatusDot tone={row.tone} className="size-1.5 -translate-y-px" />
          <span className={cn("min-w-0 break-words", TONE_TEXT[row.tone])}>
            {row.label}
          </span>
          {row.detail && (
            <span className="col-start-2 min-w-0 text-[12px] break-words text-muted-foreground">
              <Prose text={row.detail} />
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
