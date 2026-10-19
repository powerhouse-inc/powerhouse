// A workflow drawn as its chain of piece logos joined by a rail coloured by a
// run: the studio's signature, used by the overview, the header and each run.
import type { ReactNode } from "react";
import type { RunRecord } from "../../workflow-editor/runtime-client.js";
import { BlockLogo } from "../../workflow-editor/ui/BlockSelector.js";
import {
  CORE_PIECE,
  stepBlock,
  type BlockIdentity,
} from "../../workflow-editor/ui/blocks.js";
import { graphLayout } from "./graph-layout.js";
import type { stepOutline } from "./step-outline.js";
import { StepTip, Tip, TipProvider } from "./tips.js";
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
  // The hover card; a "label: status" line without one.
  tip?: ReactNode;
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
    <TipProvider>
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
            <Tip
              content={
                link.tip ??
                (link.status
                  ? `${link.label}: ${link.status.toLowerCase()}`
                  : link.label)
              }
            >
              <span
                className={`flex shrink-0 items-center justify-center rounded-full bg-card ${
                  md ? "h-8 w-8" : "h-6 w-6"
                } ${
                  link.status === "SKIPPED"
                    ? "border-[1.5px] border-dashed border-foreground/40"
                    : `ring-[1.5px] dark:bg-white ${RING[tones[index]]}`
                }`}
              >
                <span
                  className={
                    link.status === "SKIPPED" ? "flex opacity-40" : "flex"
                  }
                >
                  <BlockLogo bare block={link.block} size={md ? 16 : 14} />
                </span>
              </span>
            </Tip>
          </li>
        ))}
        {overflow ? (
          <li aria-hidden className="flex items-center">
            <span className={`h-0.5 ${md ? "w-5" : "w-3"} bg-foreground/15`} />
            <Tip
              content={props.links
                .slice(shown.length)
                .map((link) => link.label)
                .join(", ")}
            >
              <span
                className={`flex shrink-0 items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-medium tabular-nums text-muted-foreground ${
                  md ? "h-8" : "h-6"
                }`}
              >
                +{hidden}
              </span>
            </Tip>
          </li>
        ) : null}
      </ol>
    </TipProvider>
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
  const records = new Map(
    (latest?.steps ?? []).map((record) => [record.stepKey, record]),
  );
  // The layout's order and ports, so each card reads as the graph's does.
  return graphLayout(workflow).nodes.map(({ step, port }) => {
    const record = records.get(step.key);
    return {
      id: step.id,
      block: stepBlock(step),
      label: step.name || step.key,
      status: record?.status,
      tip: (
        <StepTip
          step={step}
          port={port}
          record={record}
          ran={Boolean(latest)}
        />
      ),
    };
  });
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
    <TipProvider>
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
          <Tip
            key={run.id}
            content={`${statusLabel(run.status)}, ${formatAbsolute(run.startedAt)}`}
          >
            <span
              aria-hidden
              className={`h-5 w-1.5 rounded-full ${TICK[toneOf(RUN_TONE, run.status)]}`}
            />
          </Tip>
        ))}
      </span>
    </TipProvider>
  );
}
