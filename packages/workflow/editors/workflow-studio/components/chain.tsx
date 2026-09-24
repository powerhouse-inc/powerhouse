// A workflow drawn as its chain of piece logos joined by a rail coloured by a
// run: the studio's signature, used by the overview, the header and each run.
import type { RunRecord } from "../../workflow-editor/runtime-api.js";
import { BlockLogo } from "../../workflow-editor/ui/BlockSelector.js";
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
  blockType: string;
  label: string;
  // How the run fared here; undefined when it never got this far.
  status?: string;
}

const RING: Record<Tone, string> = {
  ok: "ring-wf-ok",
  fail: "ring-wf-fail",
  warn: "ring-wf-warn",
  run: "ring-wf-run",
  idle: "ring-foreground/15",
};

const RAIL: Record<Tone, string> = {
  ok: "bg-wf-ok",
  fail: "bg-wf-fail",
  warn: "bg-wf-warn",
  run: "bg-wf-run",
  idle: "bg-foreground/15",
};

export function MiniChain(props: { links: ChainLink[]; size?: "sm" | "md" }) {
  const md = props.size === "md";
  const tones = props.links.map((link) =>
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
      {props.links.map((link, index) => (
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
            className={`flex shrink-0 items-center justify-center rounded-full bg-card ring-[1.5px] dark:bg-white ${
              md ? "h-8 w-8" : "h-6 w-6"
            } ${RING[tones[index]]} ${link.status === "SKIPPED" ? "opacity-50" : ""}`}
          >
            <BlockLogo bare blockType={link.blockType} size={md ? 16 : 14} />
          </span>
        </li>
      ))}
    </ol>
  );
}

/** A run's own chain: the trigger, then every step it recorded. */
export function runLinks(
  run: RunRecord,
  triggerBlockType?: string,
): ChainLink[] {
  return [
    {
      id: "trigger",
      blockType: triggerBlockType ?? `core#${run.triggerKind}`,
      label: "Trigger",
      status: "SUCCEEDED",
    },
    ...run.steps.map((step) => ({
      id: step.stepId + step.stepKey,
      blockType: step.blockType,
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
export function RunStrip(props: { runs: RunRecord[] }) {
  // Runs arrive newest first.
  const recent = props.runs.slice(0, STRIP_LENGTH).reverse();
  const padding = STRIP_LENGTH - recent.length;
  return (
    <span
      className="flex h-5 items-end gap-[3px]"
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
