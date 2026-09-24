// The workflow's shape as a pipeline: trigger, then each step in the order a
// run walks it, annotated with how that step fared in the latest run.
import type { WorkflowState } from "document-models/workflow";
import type { RunRecord } from "../../workflow-editor/runtime-api.js";
import { useState } from "react";
import {
  blockMeta,
  usePieceLogos,
} from "../../workflow-editor/ui/block-meta.js";
import { STEP_TONE, toneOf, type Tone } from "./run-format.js";
import { stepOutline, type OutlineStep } from "./step-outline.js";

const RAIL: Record<Tone, string> = {
  ok: "bg-wf-ok",
  fail: "bg-wf-fail",
  warn: "bg-wf-warn",
  run: "bg-wf-run",
  idle: "bg-border",
};

const RING: Record<Tone, string> = {
  ok: "ring-wf-ok",
  fail: "ring-wf-fail",
  warn: "ring-wf-warn",
  run: "ring-wf-run",
  idle: "ring-border",
};

// The piece logo, degrading to the block glyph when absent or unloadable.
function StopLogo(props: { logoUrl?: string; glyph?: string }) {
  const [broken, setBroken] = useState(false);
  if (props.logoUrl && !broken) {
    return (
      <img
        src={props.logoUrl}
        alt=""
        className="h-5 w-5"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <span className="text-sm text-muted-foreground">{props.glyph ?? "▪"}</span>
  );
}

interface Stop {
  id: string;
  title: string;
  subtitle: string;
  glyph?: string;
  logoUrl?: string;
  // How the latest run fared here; undefined when it never reached this stop.
  status?: string;
  // The port the run takes to arrive here, shown on the rail.
  port?: string | null;
}

// One stop on the rail. The rail segment into a stop is coloured by whether
// the latest run reached it, so the track shows how far a run got.
function TrackStop(props: {
  stop: Stop;
  first: boolean;
  last: boolean;
  inbound: Tone;
  outbound: Tone;
  onClick: () => void;
}) {
  const { stop } = props;
  const tone = stop.status ? toneOf(STEP_TONE, stop.status) : "idle";
  return (
    <li className="relative flex w-40 shrink-0 flex-col items-center">
      <span
        aria-hidden
        className={`absolute left-0 top-[19px] h-0.5 w-1/2 ${props.first ? "invisible" : RAIL[props.inbound]}`}
      />
      <span
        aria-hidden
        className={`absolute right-0 top-[19px] h-0.5 w-1/2 ${props.last ? "invisible" : RAIL[props.outbound]}`}
      />
      {stop.port ? (
        <span className="absolute -left-4 top-0 rounded bg-background px-1 text-[11px] text-muted-foreground">
          {stop.port}
        </span>
      ) : null}
      <button
        type="button"
        title={
          stop.status
            ? `${stop.title}: ${stop.status.toLowerCase()}`
            : stop.title
        }
        className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full bg-card ring-2 transition-shadow hover:ring-4 focus-visible:outline-none focus-visible:ring-4 ${RING[tone]}`}
        onClick={props.onClick}
      >
        <StopLogo logoUrl={stop.logoUrl} glyph={stop.glyph} />
      </button>
      <span className="mt-2 max-w-full truncate px-2 text-[13px] font-medium text-foreground">
        {stop.title}
      </span>
      <span className="max-w-full truncate px-2 text-xs text-muted-foreground">
        {stop.subtitle}
      </span>
    </li>
  );
}

function Track(props: { stops: Stop[]; onOpenEditor: () => void }) {
  const tones = props.stops.map((stop) =>
    stop.status ? toneOf(STEP_TONE, stop.status) : "idle",
  );
  return (
    <ol className="-mx-6 flex overflow-x-auto px-6 pb-1">
      {props.stops.map((stop, index) => (
        <TrackStop
          key={stop.id}
          stop={stop}
          first={index === 0}
          last={index === props.stops.length - 1}
          inbound={tones[index]}
          outbound={tones[index + 1] ?? "idle"}
          onClick={props.onOpenEditor}
        />
      ))}
    </ol>
  );
}

export function WorkflowSteps(props: {
  state: WorkflowState;
  latestRun?: RunRecord;
  onOpenEditor: () => void;
}) {
  const { state } = props;
  // Piece logos arrive with the catalog; re-renders this pipeline once known.
  usePieceLogos();
  const outline = stepOutline({
    triggerId: state.trigger?.id,
    steps: state.steps,
    edges: state.edges,
  });
  // Latest-run outcome per step, so the pipeline shows where a run stopped.
  const statusByKey = new Map(
    (props.latestRun?.steps ?? []).map((step) => [step.stepKey, step.status]),
  );

  const stopFor = (step: OutlineStep, port: string | null): Stop => {
    const meta = blockMeta(step.blockType);
    return {
      id: step.id,
      title: step.name || step.key,
      subtitle: meta.displayName,
      glyph: meta.glyph,
      logoUrl: meta.logoUrl,
      status: statusByKey.get(step.key),
      port,
    };
  };

  if (!state.trigger && state.steps.length === 0) {
    return (
      <section className="mt-8 border-t border-solid border-border pt-6">
        <p className="text-[13px] text-muted-foreground">
          This workflow has no trigger or steps yet.{" "}
          <button
            type="button"
            className="font-medium text-foreground underline underline-offset-2"
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
  const stops: Stop[] = [
    ...(state.trigger && triggerMeta
      ? [
          {
            id: state.trigger.id,
            title: triggerMeta.displayName,
            subtitle: "Trigger",
            glyph: triggerMeta.glyph,
            logoUrl: triggerMeta.logoUrl,
            // Any recorded run means the trigger fired.
            status: props.latestRun ? "SUCCEEDED" : undefined,
          },
        ]
      : []),
    ...outline.rows.map((row) => stopFor(row.step, row.port)),
  ];

  return (
    <section className="mt-8 border-t border-solid border-border pt-6">
      <div className="mb-4 flex items-baseline gap-2">
        <h3 className="text-[13px] font-medium text-foreground">Steps</h3>
        <span className="text-xs text-muted-foreground">
          {props.latestRun ? "Coloured by the latest run" : "Not run yet"}
        </span>
      </div>
      {!state.trigger ? (
        <p className="mb-3 text-xs text-wf-warn">
          No trigger set, so this workflow never starts on its own.
        </p>
      ) : null}
      <Track stops={stops} onOpenEditor={props.onOpenEditor} />
      {outline.orphans.length > 0 ? (
        <div className="mt-5">
          <p className="mb-3 text-xs text-muted-foreground">
            Not connected to the trigger, so runs never reach these:
          </p>
          <ol className="-mx-6 flex overflow-x-auto px-6 opacity-60">
            {outline.orphans.map((step) => (
              <TrackStop
                key={step.id}
                stop={stopFor(step, null)}
                first
                last
                inbound="idle"
                outbound="idle"
                onClick={props.onOpenEditor}
              />
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
