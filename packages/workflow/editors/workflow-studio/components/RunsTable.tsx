// The run journal as a filterable table. Rows expand in place to their step
// executions, so drilling into a failure never leaves the list.
import { Fragment, useMemo, useState } from "react";
import {
  rerunRun,
  type RunRecord,
  type RunStepRecord,
} from "../../workflow-editor/runtime-api.js";
import {
  blockMeta,
  usePieceLogos,
} from "../../workflow-editor/ui/block-meta.js";
import {
  formatAbsolute,
  formatDuration,
  formatTrigger,
  formatWhen,
  durationMs,
  RUN_STATUSES,
  RUN_TONE,
  STEP_TONE,
  statusLabel,
  toneOf,
} from "./run-format.js";
import { useWorkflowDocumentsInSelectedDrive } from "document-models/workflow";
import { MiniChain, runLinks } from "./chain.js";
import { Button, Icon, StatusText } from "./ui.js";

type StatusFilter = "ALL" | (typeof RUN_STATUSES)[number];
type SortKey = "startedAt" | "duration";

const CONTROL =
  "h-8 rounded-md border border-solid border-border bg-card px-2.5 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring";

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
    <div role="listitem" className="border-t border-solid border-border">
      <button
        type="button"
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3 py-2 text-left text-[13px] hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none"
        onClick={() => setOpen((value) => !value)}
      >
        <Icon
          name="chevron"
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
        />
        <StatusText
          tone={toneOf(STEP_TONE, step.status)}
          status={step.status}
          className="w-24 shrink-0 text-xs"
        />
        <span className="shrink-0 font-medium text-foreground">
          {step.stepKey}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          {meta.logoUrl ? (
            <img
              src={meta.logoUrl}
              alt=""
              title={meta.subtitle}
              className="h-3.5 w-3.5"
            />
          ) : null}
          <span className="truncate">
            {meta.logoUrl
              ? meta.displayName
              : `${meta.subtitle}: ${meta.displayName}`}
          </span>
        </span>
        {step.port && step.port !== "next" ? (
          <span className="ml-auto shrink-0 rounded bg-muted px-1.5 text-[11px] text-muted-foreground">
            took {step.port}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="space-y-2 pb-3 pl-10 pr-3">
          {step.error ? (
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-md bg-wf-fail/10 p-2 text-xs text-wf-fail">
              {step.error}
            </pre>
          ) : null}
          <details>
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              Input
            </summary>
            <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-muted p-2 text-xs text-foreground">
              {stringify(step.input)}
            </pre>
          </details>
          <details>
            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
              Output
            </summary>
            <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-muted p-2 text-xs text-foreground">
              {stringify(step.output)}
            </pre>
          </details>
        </div>
      ) : null}
    </div>
  );
}

const TRIGGER_LABEL: Record<string, string> = {
  manual: "Started by hand",
  schedule: "Started on schedule",
  webhook: "Started by a webhook call",
  "document-event": "Started by a document change",
  piece: "Started by a piece trigger",
  rerun: "Resumed from a failed run",
};

// What started the run, drawn as the first row of its step list.
function TriggerRow(props: { run: RunRecord }) {
  const { run } = props;
  const [open, setOpen] = useState(false);
  const payload = stringify(run.triggerPayload);
  const hasPayload = payload !== "" && payload !== "null" && payload !== "{}";
  return (
    <div role="listitem">
      <button
        type="button"
        aria-expanded={hasPayload ? open : undefined}
        disabled={!hasPayload}
        className="flex w-full items-center gap-3 px-3 py-2 text-left text-[13px] enabled:hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none"
        onClick={() => setOpen((value) => !value)}
      >
        <Icon
          name="chevron"
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-90" : ""} ${hasPayload ? "" : "invisible"}`}
        />
        <StatusText
          tone="ok"
          status="FIRED"
          className="w-24 shrink-0 text-xs"
        />
        <span className="shrink-0 font-medium text-foreground">trigger</span>
        <span className="truncate text-xs text-muted-foreground">
          {TRIGGER_LABEL[run.triggerKind] ?? formatTrigger(run.triggerKind)}
        </span>
        {!hasPayload ? (
          <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
            No payload
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="pb-3 pl-10 pr-3">
          <p className="text-xs text-muted-foreground">Payload</p>
          <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-muted p-2 text-xs text-foreground">
            {payload}
          </pre>
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
    <div className="space-y-3 bg-muted/40 px-4 py-4">
      {run.error ? (
        <p className="rounded-md bg-wf-fail/10 px-3 py-2 text-[13px] text-wf-fail">
          {run.error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span>
          Run <span className="font-mono">{run.id.slice(0, 8)}</span>
        </span>
        <span>Started {formatAbsolute(run.startedAt)}</span>
        {run.rerunOf ? (
          <span>
            Resumes <span className="font-mono">{run.rerunOf.slice(0, 8)}</span>
          </span>
        ) : null}
        {run.status === "FAILED" ? (
          <Button
            className="ml-auto"
            disabled={rerunning}
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
            <Icon name="retry" className="h-3.5 w-3.5" />
            {rerunning ? "Rerunning…" : "Rerun from failed step"}
          </Button>
        ) : null}
        {rerunError ? <span className="text-wf-fail">{rerunError}</span> : null}
      </div>
      <div
        role="list"
        aria-label="Steps of this run"
        className="overflow-hidden rounded-md border border-solid border-border bg-card"
      >
        <TriggerRow run={run} />
        {run.steps.map((step) => (
          <StepRow key={step.stepId + step.stepKey} step={step} />
        ))}
        {run.steps.length === 0 ? (
          <p className="border-t border-solid border-border px-3 py-2 pl-10 text-xs text-muted-foreground">
            No steps ran.
          </p>
        ) : null}
      </div>
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
        className={`flex items-center gap-1 hover:text-foreground ${props.active ? "text-foreground" : ""}`}
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
  // Each run's chain starts at its workflow's trigger block.
  const documents = useWorkflowDocumentsInSelectedDrive() ?? [];
  const triggerBlock = new Map(
    documents.map((document) => [
      document.header.id,
      document.state.global.trigger?.blockType,
    ]),
  );
  // Piece logos and names arrive with the catalog.
  usePieceLogos();

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
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex h-8 items-center gap-0.5 rounded-md bg-muted p-0.5">
          {(["ALL", ...RUN_STATUSES] as StatusFilter[]).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={status === option}
              className={`h-7 rounded px-2.5 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                status === option
                  ? "bg-card font-medium text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setStatus(option)}
            >
              {option === "ALL" ? "All" : statusLabel(option)}
              <span className="ml-1.5 tabular-nums text-muted-foreground">
                {counts[option]}
              </span>
            </button>
          ))}
        </div>
        <input
          type="search"
          className={`${CONTROL} w-48`}
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
            className="text-[13px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
            onClick={() => {
              setQuery("");
              setWorkflow("ALL");
              setTrigger("ALL");
            }}
          >
            Clear filters
          </button>
        ) : null}
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {visible.length} of {props.runs.length} runs
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-solid border-border bg-card">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-solid border-border text-xs font-medium text-muted-foreground">
              <th scope="col" className="px-3 py-2.5 font-medium">
                Status
              </th>
              {props.showWorkflow ? (
                <th scope="col" className="px-3 py-2.5 font-medium">
                  Workflow
                </th>
              ) : null}
              <th scope="col" className="px-3 py-2.5 font-medium">
                Trigger
              </th>
              <SortHeader
                label="Started"
                className="px-3 py-2.5 font-medium"
                active={sort === "startedAt"}
                descending={descending}
                onClick={() => sortBy("startedAt")}
              />
              <SortHeader
                label="Duration"
                className="px-3 py-2.5 font-medium"
                active={sort === "duration"}
                descending={descending}
                onClick={() => sortBy("duration")}
              />
              <th scope="col" className="px-3 py-2.5 font-medium">
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
                  className="px-3 py-8 text-center text-[13px] text-muted-foreground"
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
                      className={`cursor-pointer border-b border-solid border-border text-[13px] last:border-b-0 ${
                        open ? "bg-muted/40" : "hover:bg-accent/60"
                      }`}
                      onClick={() => setExpanded(open ? null : run.id)}
                    >
                      <td className="px-3 py-2.5">
                        <StatusText
                          tone={toneOf(RUN_TONE, run.status)}
                          status={run.status}
                        />
                      </td>
                      {props.showWorkflow ? (
                        <td className="max-w-48 truncate px-3 py-2.5 font-medium text-foreground">
                          {run.workflowName}
                        </td>
                      ) : null}
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {formatTrigger(run.triggerKind)}
                        <span className="ml-1.5 text-xs text-muted-foreground/70">
                          v{run.workflowVersion}
                        </span>
                      </td>
                      <td
                        className="whitespace-nowrap px-3 py-2.5 tabular-nums text-muted-foreground"
                        title={formatAbsolute(run.startedAt)}
                      >
                        {formatWhen(run.startedAt)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-muted-foreground">
                        {formatDuration(run.startedAt, run.endedAt)}
                      </td>
                      <td className="px-3 py-2">
                        <MiniChain
                          links={runLinks(
                            run,
                            triggerBlock.get(run.workflowId),
                          )}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          aria-expanded={open}
                          aria-label={`${open ? "Hide" : "Show"} steps of the run started ${formatAbsolute(run.startedAt)}`}
                          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={(event) => {
                            event.stopPropagation();
                            setExpanded(open ? null : run.id);
                          }}
                        >
                          <Icon
                            name="chevron"
                            className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`}
                          />
                        </button>
                      </td>
                    </tr>
                    {open ? (
                      <tr>
                        <td
                          colSpan={props.showWorkflow ? 7 : 6}
                          className="border-b border-solid border-border p-0"
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
