// The run journal as a filterable table. Rows expand in place to their step
// executions, so drilling into a failure never leaves the list.
import { Fragment, useMemo, useState } from "react";
import {
  rerunRun,
  type RunRecord,
  type RunStepRecord,
} from "../../workflow-editor/runtime-api.js";
import { blockMeta } from "../../workflow-editor/ui/block-meta.js";
import {
  formatAbsolute,
  formatDuration,
  formatTrigger,
  formatWhen,
  durationMs,
  RUN_DOT,
  RUN_STATUSES,
  RUN_TEXT,
  STEP_TEXT,
} from "./run-format.js";

type StatusFilter = "ALL" | (typeof RUN_STATUSES)[number];
type SortKey = "startedAt" | "duration";

const CONTROL =
  "rounded border border-solid border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 focus:border-slate-400 focus:outline-none";

function stringify(value: unknown): string {
  if (value === undefined) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value as string);
  }
}

function StepRow(props: { step: RunStepRecord }) {
  const { step } = props;
  const meta = blockMeta(step.blockType);
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-solid border-slate-100 first:border-t-0">
      <button
        type="button"
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-white focus-visible:bg-white focus-visible:outline-none"
        onClick={() => setOpen((value) => !value)}
      >
        <span
          className={`w-16 shrink-0 text-[11px] font-semibold ${STEP_TEXT[step.status] ?? "text-slate-500"}`}
        >
          {step.status}
        </span>
        <span className="shrink-0 text-xs font-medium text-slate-700">
          {step.stepKey}
        </span>
        <span className="truncate text-xs text-slate-400">
          {meta.displayName} · {meta.subtitle}
        </span>
        {step.port ? (
          <span className="ml-auto shrink-0 rounded bg-slate-100 px-1 text-[10px] text-slate-500">
            → {step.port}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="space-y-1 px-3 pb-2">
          {step.error ? (
            <pre className="overflow-x-auto rounded bg-red-50 p-2 text-[11px] text-red-600">
              {step.error}
            </pre>
          ) : null}
          <details>
            <summary className="cursor-pointer text-[11px] text-slate-400">
              input
            </summary>
            <pre className="max-h-48 overflow-auto rounded bg-white p-2 text-[11px] text-slate-600">
              {stringify(step.input)}
            </pre>
          </details>
          <details>
            <summary className="cursor-pointer text-[11px] text-slate-400">
              output
            </summary>
            <pre className="max-h-48 overflow-auto rounded bg-white p-2 text-[11px] text-slate-600">
              {stringify(step.output)}
            </pre>
          </details>
        </div>
      ) : null}
    </div>
  );
}

function RunDetail(props: { run: RunRecord; onChanged: () => void }) {
  const { run } = props;
  const [rerunning, setRerunning] = useState(false);
  const [rerunError, setRerunError] = useState<string | null>(null);
  return (
    <div className="space-y-2 bg-slate-50 px-4 py-3">
      {run.error ? (
        <p className="rounded bg-red-50 px-2 py-1 text-xs text-red-600">
          {run.error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <span>
          run <span className="font-mono">{run.id.slice(0, 8)}</span>
        </span>
        <span>started {formatAbsolute(run.startedAt)}</span>
        {run.rerunOf ? (
          <span>
            resumes <span className="font-mono">{run.rerunOf.slice(0, 8)}</span>
          </span>
        ) : null}
        {run.status === "FAILED" ? (
          <button
            type="button"
            disabled={rerunning}
            className="rounded border border-solid border-slate-300 bg-white px-2 py-1 font-medium text-slate-600 hover:border-slate-400 disabled:opacity-50"
            onClick={() => {
              setRerunning(true);
              setRerunError(null);
              rerunRun(run.id)
                .then((result) => setRerunError(result.error))
                .catch((error: unknown) =>
                  setRerunError(
                    error instanceof Error ? error.message : String(error),
                  ),
                )
                .finally(() => {
                  setRerunning(false);
                  props.onChanged();
                });
            }}
          >
            {rerunning ? "Rerunning…" : "↻ Rerun from failure"}
          </button>
        ) : null}
        {rerunError ? <span className="text-red-600">{rerunError}</span> : null}
      </div>
      {run.steps.length === 0 ? (
        <p className="text-xs text-slate-400">This run recorded no steps.</p>
      ) : (
        <div className="rounded border border-solid border-slate-200 bg-slate-50">
          {run.steps.map((step) => (
            <StepRow key={step.stepId + step.stepKey} step={step} />
          ))}
        </div>
      )}
    </div>
  );
}

function SortHeader(props: {
  label: string;
  active: boolean;
  descending: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <th scope="col" className={props.className}>
      <button
        type="button"
        className={`flex items-center gap-1 hover:text-slate-700 ${props.active ? "text-slate-700" : ""}`}
        onClick={props.onClick}
      >
        {props.label}
        <span aria-hidden className={props.active ? "" : "opacity-0"}>
          {props.descending ? "↓" : "↑"}
        </span>
      </button>
    </th>
  );
}

export function RunsTable(props: {
  runs: RunRecord[];
  showWorkflow: boolean;
  onChanged: () => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [workflow, setWorkflow] = useState("ALL");
  const [trigger, setTrigger] = useState("ALL");
  const [sort, setSort] = useState<SortKey>("startedAt");
  const [descending, setDescending] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const workflowOptions = useMemo(
    () =>
      [...new Map(props.runs.map((run) => [run.workflowId, run.workflowName]))]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [props.runs],
  );
  const triggerOptions = useMemo(
    () => [...new Set(props.runs.map((run) => run.triggerKind))].sort(),
    [props.runs],
  );

  // Everything except the status filter, so the status counts describe what
  // picking each one would actually show.
  const scoped = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return props.runs.filter((run) => {
      if (workflow !== "ALL" && run.workflowId !== workflow) return false;
      if (trigger !== "ALL" && run.triggerKind !== trigger) return false;
      if (!needle) return true;
      return (
        run.workflowName.toLowerCase().includes(needle) ||
        run.id.toLowerCase().includes(needle) ||
        (run.error?.toLowerCase().includes(needle) ?? false) ||
        run.steps.some((step) => step.stepKey.toLowerCase().includes(needle))
      );
    });
  }, [props.runs, query, workflow, trigger]);

  const counts = useMemo(
    () => ({
      ALL: scoped.length,
      RUNNING: scoped.filter((run) => run.status === "RUNNING").length,
      SUCCEEDED: scoped.filter((run) => run.status === "SUCCEEDED").length,
      FAILED: scoped.filter((run) => run.status === "FAILED").length,
    }),
    [scoped],
  );

  const visible = useMemo(() => {
    const rows = scoped.filter(
      (run) => status === "ALL" || run.status === status,
    );
    const direction = descending ? -1 : 1;
    return [...rows].sort((a, b) => {
      if (sort === "duration") {
        // An unfinished run has no duration yet; keep those together.
        const left = durationMs(a.startedAt, a.endedAt) ?? Infinity;
        const right = durationMs(b.startedAt, b.endedAt) ?? Infinity;
        return (left - right) * direction;
      }
      return (
        (new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()) *
        direction
      );
    });
  }, [scoped, status, sort, descending]);

  const filtered = query.trim() || workflow !== "ALL" || trigger !== "ALL";
  const sortBy = (key: SortKey) => {
    if (key === sort) {
      setDescending((value) => !value);
      return;
    }
    setSort(key);
    setDescending(true);
  };

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded border border-solid border-slate-300">
          {(["ALL", ...RUN_STATUSES] as StatusFilter[]).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={status === option}
              className={`border-r border-solid border-slate-200 px-2.5 py-1 text-xs last:border-r-0 ${
                status === option
                  ? "bg-slate-800 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
              onClick={() => setStatus(option)}
            >
              {option === "ALL"
                ? "All"
                : option.charAt(0) + option.slice(1).toLowerCase()}
              <span className="ml-1.5 tabular-nums opacity-60">
                {counts[option]}
              </span>
            </button>
          ))}
        </div>
        <input
          type="search"
          className={`${CONTROL} w-44`}
          placeholder="Search runs"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {props.showWorkflow && workflowOptions.length > 1 ? (
          <select
            className={CONTROL}
            value={workflow}
            onChange={(event) => setWorkflow(event.target.value)}
          >
            <option value="ALL">Every workflow</option>
            {workflowOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        ) : null}
        {triggerOptions.length > 1 ? (
          <select
            className={CONTROL}
            value={trigger}
            onChange={(event) => setTrigger(event.target.value)}
          >
            <option value="ALL">Every trigger</option>
            {triggerOptions.map((option) => (
              <option key={option} value={option}>
                {formatTrigger(option)}
              </option>
            ))}
          </select>
        ) : null}
        {filtered ? (
          <button
            type="button"
            className="text-xs text-slate-500 underline hover:text-slate-800"
            onClick={() => {
              setQuery("");
              setWorkflow("ALL");
              setTrigger("ALL");
            }}
          >
            Clear filters
          </button>
        ) : null}
        <span className="ml-auto text-[11px] tabular-nums text-slate-400">
          {visible.length} of {props.runs.length} runs
        </span>
      </div>

      <div className="overflow-x-auto rounded-md border border-solid border-slate-200 bg-white">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-solid border-slate-200 text-[11px] font-medium text-slate-400">
              <th scope="col" className="px-3 py-2">
                Status
              </th>
              {props.showWorkflow ? (
                <th scope="col" className="px-3 py-2">
                  Workflow
                </th>
              ) : null}
              <th scope="col" className="px-3 py-2">
                Trigger
              </th>
              <SortHeader
                label="Started"
                className="px-3 py-2"
                active={sort === "startedAt"}
                descending={descending}
                onClick={() => sortBy("startedAt")}
              />
              <SortHeader
                label="Duration"
                className="px-3 py-2"
                active={sort === "duration"}
                descending={descending}
                onClick={() => sortBy("duration")}
              />
              <th scope="col" className="px-3 py-2">
                Steps
              </th>
              <th scope="col" className="w-8 px-3 py-2">
                <span className="sr-only">Details</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td
                  colSpan={props.showWorkflow ? 7 : 6}
                  className="px-3 py-6 text-center text-sm text-slate-400"
                >
                  No runs match these filters.
                </td>
              </tr>
            ) : (
              visible.map((run) => {
                const open = expanded === run.id;
                return (
                  <Fragment key={run.id}>
                    <tr
                      className={`cursor-pointer border-b border-solid border-slate-100 text-sm ${
                        open ? "bg-slate-50" : "hover:bg-slate-50"
                      }`}
                      onClick={() => setExpanded(open ? null : run.id)}
                    >
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-2">
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${RUN_DOT[run.status] ?? "bg-slate-300"}`}
                          />
                          <span
                            className={`text-xs font-medium ${RUN_TEXT[run.status] ?? "text-slate-500"}`}
                          >
                            {run.status.charAt(0) +
                              run.status.slice(1).toLowerCase()}
                          </span>
                        </span>
                      </td>
                      {props.showWorkflow ? (
                        <td className="max-w-48 truncate px-3 py-2 text-slate-800">
                          {run.workflowName}
                        </td>
                      ) : null}
                      <td className="px-3 py-2 text-xs text-slate-500">
                        {formatTrigger(run.triggerKind)}
                        <span className="ml-1 text-slate-300">
                          v{run.workflowVersion}
                        </span>
                      </td>
                      <td
                        className="whitespace-nowrap px-3 py-2 text-xs tabular-nums text-slate-500"
                        title={formatAbsolute(run.startedAt)}
                      >
                        {formatWhen(run.startedAt)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums text-slate-500">
                        {formatDuration(run.startedAt, run.endedAt)}
                      </td>
                      <td className="px-3 py-2 text-xs tabular-nums text-slate-500">
                        {run.steps.length}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          aria-expanded={open}
                          aria-label={`${open ? "Hide" : "Show"} steps of the run started ${formatAbsolute(run.startedAt)}`}
                          className="rounded px-1 text-xs text-slate-400 hover:text-slate-700"
                          onClick={(event) => {
                            event.stopPropagation();
                            setExpanded(open ? null : run.id);
                          }}
                        >
                          <span aria-hidden>{open ? "▾" : "▸"}</span>
                        </button>
                      </td>
                    </tr>
                    {open ? (
                      <tr>
                        <td
                          colSpan={props.showWorkflow ? 7 : 6}
                          className="border-b border-solid border-slate-200 p-0"
                        >
                          <RunDetail run={run} onChanged={props.onChanged} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
