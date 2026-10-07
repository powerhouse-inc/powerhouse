// The whole workflow, left to right: the trigger as a labelled pill, then
// every step it reaches, branches included, coloured by the latest run.
import {
  ConnectTooltip,
  ConnectTooltipProvider,
} from "@powerhousedao/design-system/connect";
import type { WorkflowState } from "document-models/workflow";
import type { HTMLAttributes, ReactNode, Ref } from "react";
import type {
  RunRecord,
  RunStepRecord,
} from "../../workflow-editor/runtime-client.js";
import { blockMeta } from "../../workflow-editor/ui/block-meta.js";
import { BlockLogo } from "../../workflow-editor/ui/BlockSelector.js";
import { stepBlock, triggerBlock } from "../../workflow-editor/ui/blocks.js";
import {
  graphLayout,
  TRIGGER_NODE,
  type GraphEdge,
  type GraphNode,
} from "./graph-layout.js";
import {
  formatDuration,
  formatWhen,
  statusLabel,
  STEP_TONE,
  toneOf,
  type Tone,
} from "./run-format.js";

// Sizes: compact for the overview, larger for a workflow's own page; both
// name each step under its circle.
interface Geometry {
  r: number;
  col: number;
  lane: number;
  // The rail out of the trigger pill.
  lead: number;
  // Lane 0 lines up with the pill's centre.
  top: number;
  // How far a gutter track sits below its lane.
  dip: number;
  // Height of the name block under each circle; 0 for none.
  label: number;
  // The action's name under the step's name.
  subtitle: boolean;
  nameText: string;
  logo: number;
  circle: string;
  pill: string;
  pillLogo: string;
  // Port pill text size.
  portText: string;
}

const GEOMETRY: Record<"sm" | "md", Geometry> = {
  sm: {
    r: 12,
    col: 120,
    lane: 72,
    lead: 20,
    top: 14,
    dip: 50,
    label: 18,
    subtitle: false,
    nameText: "text-xs",
    logo: 14,
    circle: "h-6 w-6",
    pill: "h-7 pl-1 pr-2.5 text-[12px]",
    pillLogo: "h-5 w-5",
    portText: "text-[10px]",
  },
  md: {
    r: 18,
    col: 136,
    lane: 100,
    lead: 28,
    top: 18,
    dip: 72,
    label: 36,
    subtitle: true,
    nameText: "text-[13px]",
    logo: 20,
    circle: "h-9 w-9",
    pill: "h-9 pl-1.5 pr-3 text-[13px]",
    pillLogo: "h-6 w-6",
    portText: "text-[11px]",
  },
};

const RING: Record<Tone, string> = {
  ok: "ring-wf-ok",
  fail: "ring-wf-fail",
  warn: "ring-wf-warn",
  run: "ring-wf-run",
  idle: "ring-foreground/15 dark:ring-foreground/30",
};

const STROKE: Record<Tone, string> = {
  ok: "text-wf-ok",
  fail: "text-wf-fail",
  warn: "text-wf-warn",
  run: "text-wf-run",
  idle: "text-foreground/15 dark:text-foreground/30",
};

// The canvas's words and tints for a port, on an opaque base so the pill
// masks the line it sits on.
const PORT_PILL: Record<string, string> = {
  true: "bg-wf-ok/10 text-wf-ok ring-wf-ok/30",
  false: "bg-wf-fail/10 text-wf-fail ring-wf-fail/30",
  error: "bg-wf-warn/10 text-wf-warn ring-wf-warn/30",
};

const PORT_TEXT: Record<string, string> = {
  true: "Runs when the condition is true",
  false: "Runs when the condition is false",
  error: "Runs when the step before it fails",
};

type Point = [number, number];

// An orthogonal polyline with rounded corners.
function roundedPath(points: Point[], radius = 6): string {
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i - 1];
    const [x, y] = points[i];
    const [nx, ny] = points[i + 1];
    const r = Math.min(
      radius,
      Math.hypot(x - px, y - py) / 2,
      Math.hypot(nx - x, ny - y) / 2,
    );
    const inX = x - Math.sign(x - px) * r;
    const inY = y - Math.sign(y - py) * r;
    const outX = x + Math.sign(nx - x) * r;
    const outY = y + Math.sign(ny - y) * r;
    d += ` L ${inX} ${inY} Q ${x} ${y} ${outX} ${outY}`;
  }
  const [lx, ly] = points[points.length - 1];
  return `${d} L ${lx} ${ly}`;
}

// Turns happen in the gutter between columns, onto and off the edge's track:
// a lane's line, or the gutter under it.
function edgeRoute(
  g: Geometry,
  source: { x: number; y: number } | null,
  target: { x: number; y: number },
  trackY: number,
): {
  points: Point[];
  // Centre of the horizontal stretch a port pill sits on.
  label: { x: number; y: number };
} {
  const x1 = source ? source.x + g.r : 0;
  const y1 = source ? source.y : g.top;
  const x2 = target.x - g.r;
  const y2 = target.y;
  const after = source ? source.x + g.col / 2 : g.lead / 2;
  const before = target.x - g.col / 2;
  const route: Point[] = [
    [x1, y1],
    [after, y1],
    [after, trackY],
    [before, trackY],
    [before, y2],
    [x2, y2],
  ];
  // Drops zero-length and straight-through points, which would round oddly.
  const points = route.filter((point, index) => {
    const prev = route[index - 1] as Point | undefined;
    const next = route[index + 1] as Point | undefined;
    if (!prev || !next) return true;
    return !(
      (prev[0] === point[0] && point[0] === next[0]) ||
      (prev[1] === point[1] && point[1] === next[1])
    );
  });
  const start = trackY === y1 ? x1 : after;
  const end = trackY === y2 ? x2 : before;
  return { points, label: { x: (start + end) / 2, y: trackY } };
}

// A button when the graph opens something, else a plain mark inside a row
// that is itself the button. Passes through the tooltip's ref and handlers.
function Mark({
  label,
  className,
  onOpen,
  children,
  ref,
  onClick,
  ...rest
}: {
  label: string;
  className: string;
  onOpen?: () => void;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLElement>, "className" | "children"> & {
    ref?: Ref<HTMLElement>;
  }) {
  return onOpen ? (
    <button
      {...rest}
      ref={ref as Ref<HTMLButtonElement>}
      type="button"
      aria-label={label}
      className={`${className} focus-visible:outline-none focus-visible:ring-[3px]`}
      onClick={(event) => {
        onClick?.(event);
        onOpen();
      }}
    >
      {children}
    </button>
  ) : (
    <span
      {...rest}
      ref={ref as Ref<HTMLSpanElement>}
      onClick={onClick}
      className={className}
    >
      {children}
    </span>
  );
}

function Tip(props: { content: ReactNode; children: ReactNode }) {
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

function stepSummary(record: RunStepRecord | undefined, ran: boolean): string {
  if (!ran) return "Not run yet";
  if (!record) return "Not reached in the latest run";
  const took =
    record.startedAt && record.endedAt
      ? ` · ${formatDuration(record.startedAt, record.endedAt)}`
      : "";
  return `${statusLabel(record.status)} in the latest run${took}`;
}

function StepTip(props: {
  node: GraphNode;
  record?: RunStepRecord;
  ran: boolean;
}) {
  const { step } = props.node;
  const meta = blockMeta(stepBlock(step));
  return (
    <span className="flex flex-col gap-0.5">
      <span className="font-medium">{step.name || step.key}</span>
      <span className="text-muted-foreground">
        {meta.displayName} · {meta.subtitle}
      </span>
      {props.node.port ? (
        <span className="text-muted-foreground">
          {PORT_TEXT[props.node.port] ?? `Runs on "${props.node.port}"`}
        </span>
      ) : null}
      <span className="mt-1">{stepSummary(props.record, props.ran)}</span>
      {props.record?.error ? (
        <span className="line-clamp-3 text-wf-fail">{props.record.error}</span>
      ) : null}
    </span>
  );
}

export function WorkflowGraph(props: {
  state: WorkflowState;
  // How the trigger reads, e.g. "Manual" or "Every day at 08:00 UTC".
  triggerText: string;
  latest?: RunRecord;
  // Makes the trigger and every step a button.
  onOpen?: () => void;
  // "md" is larger and names each step under its circle.
  size?: "sm" | "md";
}) {
  const { state, latest } = props;
  const g = GEOMETRY[props.size ?? "sm"];
  const centerX = (col: number) => g.lead + (col - 1) * g.col + g.r;
  const centerY = (lane: number) => g.top + lane * g.lane;
  const layout = graphLayout({
    triggerId: state.trigger?.id,
    steps: state.steps,
    edges: state.edges,
  });
  const records = new Map(
    (latest?.steps ?? []).map((record) => [record.stepKey, record]),
  );
  const toneOfStep = (key: string): Tone => {
    const status = records.get(key)?.status;
    return status ? toneOf(STEP_TONE, status) : "idle";
  };
  const at = new Map(layout.nodes.map((node) => [node.step.id, node]));
  // Labels may run past the last circle by half a column.
  const width =
    layout.cols > 0 ? centerX(layout.cols) + (g.label ? g.col / 2 : g.r) : 0;
  const trackY = (edge: GraphEdge) =>
    centerY(edge.track.lane) + (edge.track.under ? g.dip : 0);
  const dips = layout.edges
    .filter((edge) => edge.track.under)
    .map((edge) => trackY(edge) + (PORT_PILL[edge.port] ? 10 : 4));
  const height = Math.max(
    centerY(layout.lanes - 1) + (g.label ? g.r + 6 + g.label : g.top),
    ...dips,
  );
  const routes = layout.edges.map((edge) => {
    const source = edge.from === TRIGGER_NODE ? null : at.get(edge.from);
    const target = at.get(edge.to)!;
    return {
      key: `${edge.from}-${edge.port}-${edge.to}`,
      edge,
      tone: toneOfStep(target.step.key),
      route: edgeRoute(
        g,
        source ? { x: centerX(source.col), y: centerY(source.lane) } : null,
        { x: centerX(target.col), y: centerY(target.lane) },
        trackY(edge),
      ),
    };
  });
  const trigger = state.trigger ? triggerBlock(state.trigger) : null;
  const triggerMeta = trigger ? blockMeta(trigger) : null;

  return (
    // Read-only tips: close on leave, so the next step's tip can open.
    <ConnectTooltipProvider disableHoverableContent>
      <div className="flex items-start">
        <Tip
          content={
            <span className="flex flex-col gap-0.5">
              <span className="font-medium">
                {triggerMeta?.displayName ?? "No trigger"}
              </span>
              {triggerMeta ? (
                <span className="text-muted-foreground">
                  {triggerMeta.subtitle}
                </span>
              ) : null}
              <span className="mt-1">
                {latest
                  ? `Last fired ${formatWhen(latest.startedAt)}`
                  : "Not fired yet"}
              </span>
            </span>
          }
        >
          <Mark
            label={`Trigger: ${props.triggerText}`}
            onOpen={props.onOpen}
            className={`flex shrink-0 items-center gap-1.5 rounded-full bg-card font-medium text-foreground ring-[1.5px] ${g.pill} ${
              latest ? RING.ok : RING.idle
            }`}
          >
            <span
              className={`flex items-center justify-center rounded-full dark:bg-white ${g.pillLogo}`}
            >
              {trigger ? (
                <BlockLogo bare block={trigger} size={g.logo - 2} />
              ) : null}
            </span>
            {props.triggerText}
          </Mark>
        </Tip>
        {layout.nodes.length > 0 ? (
          <ol
            className="relative -ml-px shrink-0"
            style={{ width, height }}
            aria-label={layout.nodes
              .map((node) => {
                const status = records.get(node.step.key)?.status;
                const label = node.step.name || node.step.key;
                return status ? `${label}: ${status.toLowerCase()}` : label;
              })
              .join(", ")}
          >
            <svg
              aria-hidden
              className="absolute inset-0 overflow-visible"
              width={width}
              height={height}
            >
              {routes.map(({ key, edge, route, tone }) => (
                <path
                  key={key}
                  d={roundedPath(route.points)}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeDasharray={edge.port === "error" ? "3 3" : undefined}
                  className={STROKE[tone]}
                />
              ))}
            </svg>
            {routes.map(({ key, edge, route }) =>
              PORT_PILL[edge.port] ? (
                <span
                  key={key}
                  aria-hidden
                  className="pointer-events-none absolute z-[1] -translate-x-1/2 -translate-y-1/2 rounded-full bg-card"
                  style={{ left: route.label.x, top: route.label.y }}
                >
                  <span
                    className={`block rounded-full px-1.5 font-medium leading-4 ring-1 ring-inset ${g.portText} ${PORT_PILL[edge.port]}`}
                  >
                    {edge.port}
                  </span>
                </span>
              ) : null,
            )}
            {layout.nodes.map((node) => {
              const record = records.get(node.step.key);
              const skipped = record?.status === "SKIPPED";
              const name = node.step.name || node.step.key;
              const x = centerX(node.col);
              const y = centerY(node.lane);
              return (
                <li key={node.step.id}>
                  <span
                    className="absolute"
                    style={{ left: x - g.r, top: y - g.r }}
                  >
                    <Tip
                      content={
                        <StepTip
                          node={node}
                          record={record}
                          ran={Boolean(latest)}
                        />
                      }
                    >
                      <Mark
                        label={`${name}: ${
                          record ? record.status.toLowerCase() : "not run"
                        }`}
                        onOpen={props.onOpen}
                        className={`flex items-center justify-center rounded-full bg-card transition-shadow ${g.circle} ${
                          skipped
                            ? "border-[1.5px] border-dashed border-foreground/40"
                            : `ring-[1.5px] hover:ring-[3px] dark:bg-white ${RING[toneOfStep(node.step.key)]}`
                        }`}
                      >
                        <span className={skipped ? "flex opacity-40" : "flex"}>
                          <BlockLogo
                            bare
                            block={stepBlock(node.step)}
                            size={g.logo}
                          />
                        </span>
                      </Mark>
                    </Tip>
                  </span>
                  {g.label ? (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute flex flex-col items-center text-center"
                      style={{
                        left: x - (g.col - 16) / 2,
                        top: y + g.r + 6,
                        width: g.col - 16,
                      }}
                    >
                      <span
                        className={`max-w-full truncate font-medium text-foreground ${g.nameText}`}
                      >
                        {name}
                      </span>
                      {g.subtitle ? (
                        <span className="max-w-full truncate text-xs text-muted-foreground">
                          {blockMeta(stepBlock(node.step)).displayName}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>
        ) : null}
      </div>
    </ConnectTooltipProvider>
  );
}
