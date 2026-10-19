// The studio's hover cards: one look for the graph, the folded chain and the
// run strips. Portalled, so a clipping box around the target never cuts them.
import {
  ConnectTooltip,
  ConnectTooltipProvider,
} from "@powerhousedao/design-system/connect";
import type { ReactNode } from "react";
import type {
  RunRecord,
  RunStepRecord,
} from "../../workflow-editor/runtime-client.js";
import { blockMeta } from "../../workflow-editor/ui/block-meta.js";
import {
  stepBlock,
  type BlockIdentity,
} from "../../workflow-editor/ui/blocks.js";
import type { OutlineStep } from "./step-outline.js";
import { formatDuration, formatWhen, statusLabel } from "./run-format.js";

// Read-only tips: close on leave, so the next target's tip can open.
export function TipProvider(props: { children: ReactNode }) {
  return (
    <ConnectTooltipProvider disableHoverableContent>
      {props.children}
    </ConnectTooltipProvider>
  );
}

export function Tip(props: { content: ReactNode; children: ReactNode }) {
  return (
    <ConnectTooltip
      content={props.content}
      side="bottom"
      delayDuration={100}
      className="max-w-64 rounded-md border-solid border-foreground/10 bg-card px-2.5 py-1.5 text-foreground shadow-lg"
    >
      {props.children}
    </ConnectTooltip>
  );
}

const PORT_TEXT: Record<string, string> = {
  true: "Runs when the condition is true",
  false: "Runs when the condition is false",
  error: "Runs when the step before it fails",
};

function stepSummary(record: RunStepRecord | undefined, ran: boolean): string {
  if (!ran) return "Not run yet";
  if (!record) return "Not reached in the latest run";
  const took =
    record.startedAt && record.endedAt
      ? ` · ${formatDuration(record.startedAt, record.endedAt)}`
      : "";
  return `${statusLabel(record.status)} in the latest run${took}`;
}

export function StepTip(props: {
  step: OutlineStep;
  // The port it runs on; null for "next".
  port: string | null;
  record?: RunStepRecord;
  ran: boolean;
}) {
  const { step } = props;
  const meta = blockMeta(stepBlock(step));
  return (
    <span className="flex flex-col gap-0.5">
      <span className="font-medium">{step.name || step.key}</span>
      <span className="text-muted-foreground">
        {meta.displayName} · {meta.subtitle}
      </span>
      {props.port ? (
        <span className="text-muted-foreground">
          {PORT_TEXT[props.port] ?? `Runs on "${props.port}"`}
        </span>
      ) : null}
      <span className="mt-1">{stepSummary(props.record, props.ran)}</span>
      {props.record?.error ? (
        <span className="line-clamp-3 text-wf-fail">{props.record.error}</span>
      ) : null}
    </span>
  );
}

export function TriggerTip(props: {
  trigger: BlockIdentity | null;
  latest?: RunRecord;
  // How it reads in full, for a target that truncates it.
  text?: string;
}) {
  const meta = props.trigger ? blockMeta(props.trigger) : null;
  return (
    <span className="flex flex-col gap-0.5">
      <span className="font-medium">{meta?.displayName ?? "No trigger"}</span>
      {props.text && props.text !== meta?.displayName ? (
        <span>{props.text}</span>
      ) : null}
      {meta ? (
        <span className="text-muted-foreground">{meta.subtitle}</span>
      ) : null}
      <span className="mt-1">
        {props.latest
          ? `Last fired ${formatWhen(props.latest.startedAt)}`
          : "Not fired yet"}
      </span>
    </span>
  );
}
