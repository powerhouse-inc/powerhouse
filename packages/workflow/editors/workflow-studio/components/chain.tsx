// A workflow drawn as its chain of piece logos joined by a rail coloured by a
// run: the studio's signature, used by the overview, the header and each run.
import type { RunRecord } from "../../workflow-editor/runtime-client.js";
import { BlockLogo } from "../../workflow-editor/ui/BlockSelector.js";
import {
  CORE_PIECE,
  stepBlock,
  type BlockIdentity,
} from "../../workflow-editor/ui/blocks.js";
import { stepOutline } from "./step-outline.js";
import {
  formatAbsolute,
  RUN_TONE,
  STEP_TONE,
  statusLabel,
  toneOf,
  type Tone,
} from "./run-format.js";

export interface ChainLink {
  id: string;
  block: BlockIdentity;
  label: string;
  // How the run fared here; undefined when it never got this far.
  status?: string;
}

const RING: Record<Tone, string> = {
  ok: "ring-wf-ok",
  fail: "ring-wf-fail",
  warn: "ring-wf-warn",
  run: "ring-wf-run",
  idle: "ring-foreground/15 dark:ring-foreground/30",
};

const RAIL: Record<Tone, string> = {
  ok: "bg-wf-ok",
  fail: "bg-wf-fail",
  warn: "bg-wf-warn",
  run: "bg-wf-run",
  idle: "bg-foreground/15 dark:bg-foreground/30",
};

// Past this many stops the chain ends in "+N", so a long workflow can't spill
// into the next column; the label still names every step.
const MAX_STOPS = 6;

export function MiniChain(props: { links: ChainLink[]; size?: "sm" | "md" }) {
  const md = props.size === "md";
  const overflow = props.links.length > MAX_STOPS;
  const shown = overflow ? props.links.slice(0, MAX_STOPS - 1) : props.links;
  const hidden = props.links.length - shown.length;
  const tones = shown.map((link) =>
    link.status ? toneOf(STEP_TONE, link.status) : "idle",
  );
  return (
    <ol
      className="flex items-center"
      aria-label={props.links
        .map(
          (link) =>
            `${link.label}${link.status ? `: ${link.status.toLowerCase()}` : ""}`,
        )
        .join(", ")}
    >
      {shown.map((link, index) => (
        <li key={link.id} className="flex items-center">
          {index > 0 ? (
            <span
              aria-hidden
              className={`h-0.5 ${md ? "w-5" : "w-3"} ${RAIL[tones[index]]}`}
            />
          ) : null}
          <span
            title={
              link.status
                ? `${link.label}: ${link.status.toLowerCase()}`
                : link.label
            }
            className={`flex shrink-0 items-center justify-center rounded-full bg-card ${
              md ? "h-8 w-8" : "h-6 w-6"
            } ${
              link.status === "SKIPPED"
                ? "border-[1.5px] border-dashed border-foreground/40"
                : `ring-[1.5px] dark:bg-white ${RING[tones[index]]}`
            }`}
          >
            <span
              className={link.status === "SKIPPED" ? "flex opacity-40" : "flex"}
            >
              <BlockLogo bare block={link.block} size={md ? 16 : 14} />
            </span>
          </span>
        </li>
      ))}
      {overflow ? (
        <li aria-hidden className="flex items-center">
          <span className={`h-0.5 ${md ? "w-5" : "w-3"} bg-foreground/15`} />
          <span
            title={props.links
              .slice(shown.length)
              .map((link) => link.label)
              .join(", ")}
            className={`flex shrink-0 items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-medium tabular-nums text-muted-foreground ${
              md ? "h-8" : "h-6"
            }`}
          >
            +{hidden}
          </span>
        </li>
      ) : null}
    </ol>
  );
}

// The trigger a run's kind names: "piece:<pieceName>:<triggerName>" for a
// piece trigger, else one of the core piece's.
export function triggerOfKind(kind: string): BlockIdentity {
  if (kind.startsWith("piece:")) {
    const rest = kind.slice("piece:".length);
    const colon = rest.indexOf(":");
    if (colon > 0) {
      return {
        pieceName: rest.slice(0, colon),
        kind: "trigger",
        name: rest.slice(colon + 1),
      };
    }
  }
  return { pieceName: CORE_PIECE, kind: "trigger", name: kind };
}

/** A workflow's steps in the order a run reaches them, coloured by a run. */
export function workflowLinks(
  workflow: Parameters<typeof stepOutline>[0],
  latest?: RunRecord,
): ChainLink[] {
  const status = new Map(
    (latest?.steps ?? []).map((step) => [step.stepKey, step.status]),
  );
  return stepOutline(workflow).rows.map(({ step }) => ({
    id: step.id,
    block: stepBlock(step),
    label: step.name || step.key,
    status: status.get(step.key),
  }));
}

/** A run's own chain: the trigger, then every step it recorded. */
export function runLinks(run: RunRecord, trigger?: BlockIdentity): ChainLink[] {
  return [
    {
      id: "trigger",
      block: trigger ?? triggerOfKind(run.triggerKind),
      label: "Trigger",
      status: "SUCCEEDED",
    },
    ...run.steps.map((step) => ({
      id: step.stepId + step.stepKey,
      block: {
        pieceName: step.pieceName,
        kind: "action" as const,
        name: step.blockName,
      },
      label: step.stepKey,
      status: step.status,
    })),
  ];
}

const STRIP_LENGTH = 14;

const TICK: Record<Tone, string> = {
  ok: "bg-wf-ok",
  fail: "bg-wf-fail",
  warn: "bg-wf-warn",
  run: "bg-wf-run animate-pulse",
  idle: "bg-foreground/25",
};

/** Recent runs as ticks, oldest to newest, padded so strips line up. */
export function RunStrip(props: {
  runs: RunRecord[];
  // Dots on the strip's centre line rather than its foot, to sit on a text line.
  centered?: boolean;
}) {
  // Runs arrive newest first.
  const recent = props.runs.slice(0, STRIP_LENGTH).reverse();
  const padding = STRIP_LENGTH - recent.length;
  return (
    <span
      className={`flex h-5 gap-[3px] ${props.centered ? "items-center" : "items-end"}`}
      aria-label={
        recent.length === 0
          ? "No runs yet"
          : `Last ${recent.length} runs: ${recent.map((run) => run.status.toLowerCase()).join(", ")}`
      }
    >
      {Array.from({ length: padding }, (_, index) => (
        <span
          key={`pad-${index}`}
          aria-hidden
          className="h-1.5 w-1.5 rounded-full bg-foreground/10"
        />
      ))}
      {recent.map((run) => (
        <span
          key={run.id}
          aria-hidden
          title={`${statusLabel(run.status)}, ${formatAbsolute(run.startedAt)}`}
          className={`h-5 w-1.5 rounded-full ${TICK[toneOf(RUN_TONE, run.status)]}`}
        />
      ))}
    </span>
  );
}
