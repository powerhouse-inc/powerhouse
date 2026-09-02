// Run journal view, GitHub-Actions style: run rows with status, trigger and
// duration; expanding a run shows its per-step executions.
import { useEffect, useState } from "react";
import {
  fetchRuns,
  type RunRecord,
  type RunStepRecord,
} from "../../workflow-editor/runtime-api.js";
import { blockMeta } from "../../workflow-editor/ui/block-meta.js";

const POLL_MS = 5000;

const RUN_DOT: Record<string, string> = {
  SUCCEEDED: "bg-green-500",
  FAILED: "bg-red-500",
  RUNNING: "bg-amber-400",
};

const STEP_TEXT: Record<string, string> = {
  SUCCEEDED: "text-green-600",
  FAILED: "text-red-600",
  SKIPPED: "text-slate-400",
};

function formatDuration(startedAt: string, endedAt: string | null): string {
  if (!endedAt) return "…";
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function formatWhen(startedAt: string): string {
  const diff = Date.now() - new Date(startedAt).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(startedAt).toLocaleString();
}

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
    <div className="border-t border-solid border-slate-100">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-50"
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
          <span className="rounded bg-slate-100 px-1 text-[10px] text-slate-500">
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
            <pre className="max-h-48 overflow-auto rounded bg-slate-50 p-2 text-[11px] text-slate-600">
              {stringify(step.input)}
            </pre>
          </details>
          <details>
            <summary className="cursor-pointer text-[11px] text-slate-400">
              output
            </summary>
            <pre className="max-h-48 overflow-auto rounded bg-slate-50 p-2 text-[11px] text-slate-600">
              {stringify(step.output)}
            </pre>
          </details>
        </div>
      ) : null}
    </div>
  );
}

function RunRow(props: { run: RunRecord; showWorkflow: boolean }) {
  const { run } = props;
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-solid border-slate-200 bg-white">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-3 py-2 text-left"
        onClick={() => setOpen((value) => !value)}
      >
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${RUN_DOT[run.status] ?? "bg-slate-300"}`}
          title={run.status}
        />
        <span className="min-w-0 grow">
          <span className="block truncate text-sm font-medium text-slate-800">
            {props.showWorkflow ? run.workflowName : (run.error ?? run.status)}
          </span>
          <span className="block text-xs text-slate-400">
            {run.triggerKind} · v{run.workflowVersion} ·{" "}
            {formatWhen(run.startedAt)}
          </span>
        </span>
        <span className="shrink-0 text-xs text-slate-400">
          {formatDuration(run.startedAt, run.endedAt)}
        </span>
      </button>
      {open ? (
        <div className="pb-1">
          {run.error ? (
            <p className="mx-3 mb-1 rounded bg-red-50 px-2 py-1 text-xs text-red-600">
              {run.error}
            </p>
          ) : null}
          {run.steps.map((step) => (
            <StepRow key={step.stepId + step.stepKey} step={step} />
          ))}
          {run.steps.length === 0 ? (
            <p className="px-3 pb-2 text-xs text-slate-400">No steps ran.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function RunsView(props: {
  workflowId?: string;
  title: string;
  onFire?: () => Promise<string | null>;
}) {
  const [runs, setRuns] = useState<RunRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [firing, setFiring] = useState(false);
  const [fireError, setFireError] = useState<string | null>(null);

  const workflowId = props.workflowId;
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetchRuns(workflowId).then(
        (result) => {
          if (!cancelled) {
            setRuns(result);
            setError(null);
          }
        },
        (loadError: unknown) => {
          if (!cancelled) {
            setError(
              loadError instanceof Error
                ? loadError.message
                : String(loadError),
            );
          }
        },
      );
    };
    // The host keys this component by workflowId, so no reset needed here.
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [workflowId]);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-base font-semibold text-slate-800">
          {props.title}
        </h2>
        <span className="grow" />
        {props.onFire ? (
          <button
            type="button"
            disabled={firing}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            onClick={() => {
              setFiring(true);
              setFireError(null);
              props.onFire!()
                .then((fireResultError) => setFireError(fireResultError))
                .catch((fireCallError: unknown) =>
                  setFireError(
                    fireCallError instanceof Error
                      ? fireCallError.message
                      : String(fireCallError),
                  ),
                )
                .finally(() => {
                  setFiring(false);
                  fetchRuns(workflowId).then(setRuns, () => undefined);
                });
            }}
          >
            {firing ? "Firing…" : "▶ Run workflow"}
          </button>
        ) : null}
      </div>
      {fireError ? (
        <p className="mb-2 rounded bg-red-50 px-3 py-2 text-xs text-red-600">
          {fireError}
        </p>
      ) : null}
      {error ? (
        <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Runtime unreachable: {error}
        </p>
      ) : runs === null ? (
        <p className="text-sm text-slate-400">Loading runs…</p>
      ) : runs.length === 0 ? (
        <p className="text-sm text-slate-400">
          No runs yet{props.onFire ? " — fire the workflow to see one" : ""}.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {runs.map((run) => (
            <RunRow
              key={run.id}
              run={run}
              showWorkflow={props.workflowId === undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
