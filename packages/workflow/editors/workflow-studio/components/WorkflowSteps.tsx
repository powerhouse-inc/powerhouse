// The workflow's shape as a pipeline: trigger, then each step in the order a
// run walks it, annotated with how that step fared in the latest run.
import type { WorkflowState } from "document-models/workflow";
import type { RunRecord } from "../../workflow-editor/runtime-api.js";
import { blockMeta } from "../../workflow-editor/ui/block-meta.js";
import { RUN_DOT } from "./run-format.js";
import { stepOutline, type OutlineStep } from "./step-outline.js";

const STEP_DOT: Record<string, string> = {
  ...RUN_DOT,
  SKIPPED: "bg-slate-300",
  REPLAYED: "bg-sky-400",
};

function Chip(props: {
  title: string;
  subtitle: string;
  glyph?: string;
  logoUrl?: string;
  status?: string;
  muted?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={
        props.status ? `${props.subtitle} · ${props.status}` : props.subtitle
      }
      className={`flex max-w-56 items-center gap-2 rounded border border-solid px-2 py-1 text-left hover:border-slate-400 ${
        props.muted
          ? "border-dashed border-slate-300 bg-slate-50"
          : "border-slate-200 bg-white"
      }`}
      onClick={props.onClick}
    >
      {props.logoUrl ? (
        <img src={props.logoUrl} alt="" className="h-4 w-4 shrink-0" />
      ) : (
        <span className="w-4 shrink-0 text-center text-xs text-slate-400">
          {props.glyph ?? "▪"}
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium text-slate-700">
          {props.title}
        </span>
        <span className="block truncate text-[11px] text-slate-400">
          {props.subtitle}
        </span>
      </span>
      {props.status ? (
        <span
          className={`ml-1 h-2 w-2 shrink-0 rounded-full ${STEP_DOT[props.status] ?? "bg-slate-300"}`}
        />
      ) : null}
    </button>
  );
}

function Arrow(props: { port: string | null }) {
  return (
    <span className="flex shrink-0 items-center gap-1 text-slate-300">
      <span aria-hidden>→</span>
      {props.port ? (
        <span className="rounded bg-slate-100 px-1 text-[10px] text-slate-500">
          {props.port}
        </span>
      ) : null}
    </span>
  );
}

export function WorkflowSteps(props: {
  state: WorkflowState;
  latestRun?: RunRecord;
  onOpenEditor: () => void;
}) {
  const { state } = props;
  const outline = stepOutline({
    triggerId: state.trigger?.id,
    steps: state.steps,
    edges: state.edges,
  });
  // Latest-run outcome per step, so the pipeline shows where a run stopped.
  const statusByKey = new Map(
    (props.latestRun?.steps ?? []).map((step) => [step.stepKey, step.status]),
  );

  const chipFor = (step: OutlineStep, muted: boolean) => {
    const meta = blockMeta(step.blockType);
    return (
      <Chip
        key={step.id}
        title={step.name || step.key}
        subtitle={meta.displayName}
        glyph={meta.glyph}
        logoUrl={meta.logoUrl}
        status={statusByKey.get(step.key)}
        muted={muted}
        onClick={props.onOpenEditor}
      />
    );
  };

  if (!state.trigger && state.steps.length === 0) {
    return (
      <section className="mt-3 rounded-md border border-solid border-slate-200 bg-white px-3 py-4">
        <p className="text-xs text-slate-500">
          This workflow has no trigger or steps yet.{" "}
          <button
            type="button"
            className="underline hover:text-slate-800"
            onClick={props.onOpenEditor}
          >
            Open the editor
          </button>{" "}
          to build it.
        </p>
      </section>
    );
  }

  const triggerMeta = state.trigger ? blockMeta(state.trigger.blockType) : null;

  return (
    <section className="mt-3 rounded-md border border-solid border-slate-200 bg-white px-3 py-3">
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="text-[11px] text-slate-400">Steps</h3>
        <span className="text-[11px] tabular-nums text-slate-400">
          {state.steps.length}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {triggerMeta && state.trigger ? (
          <Chip
            title={triggerMeta.displayName}
            subtitle="Trigger"
            glyph={triggerMeta.glyph}
            logoUrl={triggerMeta.logoUrl}
            muted={false}
            onClick={props.onOpenEditor}
          />
        ) : (
          <span className="rounded border border-dashed border-slate-300 px-2 py-1 text-[11px] text-slate-400">
            No trigger
          </span>
        )}
        {outline.rows.map((row) => (
          <span key={row.step.id} className="flex items-center gap-2">
            <Arrow port={row.port} />
            {chipFor(row.step, false)}
          </span>
        ))}
      </div>
      {outline.orphans.length > 0 ? (
        <div className="mt-3 border-t border-solid border-slate-100 pt-2">
          <p className="mb-2 text-[11px] text-slate-400">
            Not connected to the trigger, so runs never reach these:
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {outline.orphans.map((step) => chipFor(step, true))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
