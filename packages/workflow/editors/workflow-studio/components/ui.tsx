// Studio building blocks, drawn from Connect's theme tokens so both themes work.
import type { ReactNode } from "react";
export { Button } from "../../shared/controls.js";
export { Icon } from "../../shared/icons.js";
import { statusLabel, TONE_DOT, TONE_TEXT, type Tone } from "./run-format.js";

// A draft or unknown state is hollow, so it never reads as healthy.
export function StatusDot(props: { tone: Tone; className?: string }) {
  const hollow = props.tone === "idle";
  return (
    <span
      aria-hidden
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${
        hollow
          ? "border border-solid border-muted-foreground/60"
          : TONE_DOT[props.tone]
      } ${props.className ?? ""}`}
    />
  );
}

export function StatusText(props: {
  tone: Tone;
  status: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium ${TONE_TEXT[props.tone]} ${props.className ?? ""}`}
    >
      <StatusDot tone={props.tone} />
      {statusLabel(props.status)}
    </span>
  );
}

/** A label/value pair for a header's facts line. */
export function Fact(props: {
  label: string;
  children: ReactNode;
  title?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5" title={props.title}>
      <dt className="text-xs text-muted-foreground">{props.label}</dt>
      <dd className="truncate text-[13px] tabular-nums text-foreground">
        {props.children}
      </dd>
    </div>
  );
}
