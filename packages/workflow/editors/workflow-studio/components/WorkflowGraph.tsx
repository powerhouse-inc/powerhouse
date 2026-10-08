// The whole workflow, left to right: the trigger as a labelled pill, then
// every step it reaches, branches included, coloured by the latest run.
import {
  ConnectTooltip,
  ConnectTooltipProvider,
} from "@powerhousedao/design-system/connect";
import type { WorkflowState } from "document-models/workflow";
import {
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
} from "react";
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
export interface Geometry {
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
  // Centre of the pill's logo from its left edge: where a stacked rail drops.
  pillLogoX: number;
  // Port pill text size.
  portText: string;
}

// Room between a stacked trigger pill and the steps' first lane.
const STACK_GAP = 16;

export interface Room {
  // The width the graph may take, and its trigger pill's.
  width: number;
  pill: number;
}

export interface GraphFit {
  g: Geometry;
  // The trigger pill sits on its own line above the steps.
  stacked: boolean;
  // Columns per row; rows alternate direction, like a snake.
  perRow: number;
}

// Columns widen into spare room up to this much, so names fit on fewer lines.
const MAX_STRETCH = 1.5;

// Beside the trigger if it fits; else the trigger above, and the steps
// wrapping onto rows. Either way the columns then share out spare width.
export function fitGraph(
  base: Geometry,
  cols: number,
  room: Room | null,
): GraphFit {
  if (!room || room.width <= 0 || cols === 0) {
    return { g: base, stacked: false, perRow: Math.max(cols, 1) };
  }
  // Names may run half a column past the last circle.
  const tailOf = (col: number) => (base.label ? col / 2 : base.r);
  const span = (n: number, lead: number) =>
    lead + (n - 1) * base.col + base.r + tailOf(base.col);
  const beside = room.width - room.pill;
  const stacked = span(cols, base.lead) > beside;
  const lead = stacked ? base.pillLogoX * 2 : base.lead;
  const space = stacked ? room.width : beside;
  const fits =
    Math.floor((space - lead - base.r - tailOf(base.col)) / base.col) + 1;
  const perRow = stacked ? Math.min(cols, Math.max(2, fits)) : cols;
  // The widest column that still lets a full row end within the space.
  const fill = base.label
    ? (space - lead - base.r) / (perRow - 0.5)
    : perRow > 1
      ? (space - lead - 2 * base.r) / (perRow - 1)
      : base.col;
  const col = Math.floor(
    Math.min(base.col * MAX_STRETCH, Math.max(base.col, fill)),
  );
  return { g: { ...base, col, lead }, stacked, perRow };
}

export const GEOMETRY: Record<"sm" | "md", Geometry> = {
  sm: {
    r: 12,
    // Room for a name on two 16px lines before it is cut.
    col: 144,
    // A circle, its two-line name, and a gutter a track can run in.
    lane: 80,
    // The rail between the trigger pill and the first step.
    lead: 40,
    top: 14,
    dip: 60,
    label: 34,
    subtitle: false,
    nameText: "text-xs leading-4",
    logo: 14,
    circle: "h-6 w-6",
    pill: "h-7 pl-1 pr-2.5 text-[12px]",
    pillLogo: "h-5 w-5",
    pillLogoX: 14,
    portText: "text-[10px]",
  },
  md: {
    r: 18,
    col: 168,
    // Two lines of name and one of the action under each circle.
    lane: 112,
    lead: 48,
    top: 18,
    dip: 86,
    label: 54,
    subtitle: true,
    nameText: "text-[13px] leading-[18px]",
    logo: 20,
    circle: "h-9 w-9",
    pill: "h-9 pl-1.5 pr-3 text-[13px]",
    pillLogo: "h-6 w-6",
    pillLogoX: 18,
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
  false: "bg-foreground/5 text-muted-foreground ring-foreground/15",
  error: "bg-wf-fail/10 text-wf-fail ring-wf-fail/30",
};

const PORT_TEXT: Record<string, string> = {
  true: "Runs when the condition is true",
  false: "Runs when the condition is false",
  error: "Runs when the step before it fails",
};

export type Point = [number, number];

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

interface Spot {
  x: number;
  y: number;
  row: number;
  // 1 on a row running left to right, -1 on one running back.
  dir: number;
}

// Drops repeated and straight-through points, which would round oddly; each
// against the points kept, so a run of repeats cannot take a corner with it.
export function simplify(route: Point[]): Point[] {
  const points: Point[] = [];
  for (const point of route) {
    const last = points.at(-1);
    if (last && last[0] === point[0] && last[1] === point[1]) continue;
    const prev = points.at(-2);
    if (
      prev &&
      last &&
      ((prev[0] === last[0] && last[0] === point[0]) ||
        (prev[1] === last[1] && last[1] === point[1]))
    ) {
      points.pop();
    }
    points.push(point);
  }
  return points;
}

// Within a row, turns happen in the gutter between columns, onto and off the
// edge's track: a lane's line, or the gutter under it.
function edgeRoute(
  g: Geometry,
  source: Spot | null,
  target: Spot,
  trackY: number,
  // The trigger pill sits above the steps, so its rail drops in from the top.
  stacked: boolean,
): {
  points: Point[];
  // Centre of the horizontal stretch a port pill sits on.
  label: { x: number; y: number };
} {
  const dir = target.dir;
  const after = source ? source.x + (dir * g.col) / 2 : g.lead / 2;
  const fromAbove = !source && stacked;
  const x1 = source ? source.x + dir * g.r : fromAbove ? after : 0;
  const y1 = source ? source.y : fromAbove ? -STACK_GAP : g.top;
  const x2 = target.x - dir * g.r;
  const y2 = target.y;
  const before = target.x - (dir * g.col) / 2;
  const points = simplify([
    [x1, y1],
    [after, y1],
    [after, trackY],
    [before, trackY],
    [before, y2],
    [x2, y2],
  ]);
  const start = trackY === y1 ? x1 : after;
  const end = trackY === y2 ? x2 : before;
  return { points, label: { x: (start + end) / 2, y: trackY } };
}

// Into a later row: out past the end of the source's row, down, and in from
// the side that row starts on; a row further down is reached above its line.
function wrapRoute(
  g: Geometry,
  source: Spot,
  target: Spot,
  ends: { left: number; right: number },
): { points: Point[]; label: { x: number; y: number } } {
  const turn = source.dir > 0 ? ends.right : ends.left;
  const x1 = source.x + source.dir * g.r;
  const before = target.x - (target.dir * g.col) / 2;
  const enters = (target.row - source.row) % 2 === 1;
  const y = enters ? target.y : target.y - g.lane / 2;
  const points = simplify([
    [x1, source.y],
    [turn, source.y],
    [turn, y],
    [before, y],
    [before, target.y],
    [target.x - target.dir * g.r, target.y],
  ]);
  return { points, label: { x: (x1 + turn) / 2, y: source.y } };
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
  // Wraps the steps onto rows, like a snake, rather than overflowing.
  fit?: boolean;
}) {
  const { state, latest } = props;
  const frame = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLSpanElement>(null);
  const [room, setRoom] = useState<Room | null>(null);
  useLayoutEffect(() => {
    const element = frame.current;
    if (!props.fit || !element) return;
    const measure = () => {
      const next = {
        width: element.clientWidth,
        pill: pill.current?.offsetWidth ?? 0,
      };
      setRoom((prev) =>
        prev?.width === next.width && prev.pill === next.pill ? prev : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (pill.current) observer.observe(pill.current);
    return () => observer.disconnect();
  }, [props.fit]);
  const layout = graphLayout({
    triggerId: state.trigger?.id,
    steps: state.steps,
    edges: state.edges,
  });
  const { g, stacked, perRow } = fitGraph(
    GEOMETRY[props.size ?? "sm"],
    layout.cols,
    props.fit ? room : null,
  );
  const rowOf = (col: number) => Math.floor((col - 1) / perRow);
  const rows = Math.max(1, Math.ceil(layout.cols / perRow));
  // Each row is as tall as the lanes its own steps use.
  const rowLanes = Array.from({ length: rows }, () => 1);
  for (const node of layout.nodes) {
    const row = rowOf(node.col);
    rowLanes[row] = Math.max(rowLanes[row], node.lane + 1);
  }
  const rowTop: number[] = [];
  for (let row = 0, y = g.top; row < rows; y += rowLanes[row] * g.lane, row++) {
    rowTop.push(y);
  }
  const spot = (col: number, lane: number): Spot => {
    const row = rowOf(col);
    const slot = (col - 1) % perRow;
    const back = row % 2 === 1;
    return {
      x: g.lead + (back ? perRow - 1 - slot : slot) * g.col + g.r,
      y: rowTop[row] + lane * g.lane,
      row,
      dir: back ? -1 : 1,
    };
  };
  const records = new Map(
    (latest?.steps ?? []).map((record) => [record.stepKey, record]),
  );
  const toneOfStep = (key: string): Tone => {
    const status = records.get(key)?.status;
    return status ? toneOf(STEP_TONE, status) : "idle";
  };
  const at = new Map(layout.nodes.map((node) => [node.step.id, node]));
  const lastX = g.lead + (Math.min(perRow, layout.cols) - 1) * g.col + g.r;
  // Labels may run past the last circle by half a column.
  const width = layout.cols > 0 ? lastX + (g.label ? g.col / 2 : g.r) : 0;
  const ends = { left: g.lead / 2, right: lastX + g.col / 2 };
  const trackY = (edge: GraphEdge, row: number) =>
    rowTop[row] + edge.track.lane * g.lane + (edge.track.under ? g.dip : 0);
  const routes = layout.edges.map((edge) => {
    const from = edge.from === TRIGGER_NODE ? null : at.get(edge.from)!;
    const to = at.get(edge.to)!;
    const source = from ? spot(from.col, from.lane) : null;
    const target = spot(to.col, to.lane);
    const wraps = source !== null && source.row !== target.row;
    return {
      key: `${edge.from}-${edge.port}-${edge.to}`,
      edge,
      tone: toneOfStep(to.step.key),
      under: !wraps && edge.track.under,
      route: wraps
        ? wrapRoute(g, source, target, ends)
        : edgeRoute(g, source, target, trackY(edge, target.row), stacked),
    };
  });
  const dips = routes
    .filter((route) => route.under)
    .map(({ route, edge }) => route.label.y + (PORT_PILL[edge.port] ? 10 : 4));
  const height = Math.max(
    ...layout.nodes.map(
      (node) =>
        spot(node.col, node.lane).y + (g.label ? g.r + 6 + g.label : g.top),
    ),
    ...dips,
  );
  // A name centred on its circle, kept inside the graph at either end.
  const labelBox = (x: number) => {
    let w = Math.min(g.col - 16, 2 * (width - x));
    let left = x - w / 2;
    // Under a stacked trigger nothing sits left of the steps: a first name
    // slides into the 16px gap before the next one, and narrows past that.
    if (stacked && left < -12) {
      left += Math.min(-12 - left, 16);
      if (left < -12) {
        w -= -12 - left;
        left = -12;
      }
    }
    return { left, width: w };
  };
  const trigger = state.trigger ? triggerBlock(state.trigger) : null;
  const triggerMeta = trigger ? blockMeta(trigger) : null;

  return (
    // Read-only tips: close on leave, so the next step's tip can open.
    <ConnectTooltipProvider disableHoverableContent>
      <div
        ref={frame}
        className={stacked ? "flex flex-col items-start" : "flex items-start"}
      >
        <span ref={pill} className="flex shrink-0">
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
        </span>
        {layout.nodes.length > 0 ? (
          <ol
            className={`relative shrink-0 ${stacked ? "" : "-ml-px"}`}
            style={{ width, height, marginTop: stacked ? STACK_GAP : 0 }}
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
              const { x, y } = spot(node.col, node.lane);
              const tip = (
                <StepTip node={node} record={record} ran={Boolean(latest)} />
              );
              return (
                <li key={node.step.id}>
                  <span
                    className="absolute"
                    style={{ left: x - g.r, top: y - g.r }}
                  >
                    <Tip content={tip}>
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
                        ...labelBox(x),
                        top: y + g.r + 6,
                      }}
                    >
                      {/* Two lines, then cut; the name opens the circle's tip too. */}
                      <Tip content={tip}>
                        <span
                          className={`pointer-events-auto line-clamp-2 max-w-full font-medium text-foreground [overflow-wrap:anywhere] ${g.nameText}`}
                        >
                          {name}
                        </span>
                      </Tip>
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
