// Edge with the mid-line add button, ported from the Activepieces builder
// edges/add-button (MIT, activepieces packages/web).
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  Position,
  type EdgeProps,
} from "@xyflow/react";
import { AddButton, portClasses, useCanvasHandlers } from "./ap-nodes.js";
import { VSPACE } from "./ap-layout.js";
import { STEP_PRESETS } from "./blocks.js";

const RADIUS = 15;

// A polyline through `points` with rounded corners.
function roundedPath(points: [number, number][]): string {
  const pts = points.filter(
    (p, i) => i === 0 || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1],
  );
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1];
    const [cx, cy] = pts[i];
    const [nx, ny] = pts[i + 1];
    const inLen = Math.hypot(cx - px, cy - py);
    const outLen = Math.hypot(nx - cx, ny - cy);
    const r = Math.min(RADIUS, inLen / 2, outLen / 2);
    const ax = cx - ((cx - px) / inLen) * r;
    const ay = cy - ((cy - py) / inLen) * r;
    const bx = cx + ((nx - cx) / outLen) * r;
    const by = cy + ((ny - cy) / outLen) * r;
    d += ` L ${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}`;
  }
  const [lx, ly] = pts[pts.length - 1];
  return `${d} L ${lx} ${ly}`;
}

// Out of the source to its lane, down the lane, then into the target from just
// above it, so the line never crosses a step between them. The label sits on
// the first turn, next to the source.
export function lanePath(
  sx: number,
  sy: number,
  lane: number,
  tx: number,
  ty: number,
): [string, number, number] {
  const turn = sy + Math.min(VSPACE / 2, (ty - sy) / 2);
  const entry = Math.max(ty - VSPACE / 4, turn);
  const path = roundedPath([
    [sx, sy],
    [sx, turn],
    [lane, turn],
    [lane, entry],
    [tx, entry],
    [tx, ty],
  ]);
  return [path, (sx + lane) / 2, turn];
}

export function ApEdge(props: EdgeProps) {
  const handlers = useCanvasHandlers();
  const data = props.data as {
    edgeId: string;
    port: string;
    portLabel?: string;
    condition: string | null;
    fromSkipped?: boolean;
    dead?: boolean;
    lane?: number;
  };
  const [path, labelX, labelY] =
    data.lane !== undefined && props.targetY > props.sourceY
      ? lanePath(
          props.sourceX,
          props.sourceY,
          data.lane,
          props.targetX,
          props.targetY,
        )
      : getSmoothStepPath({
          sourceX: props.sourceX,
          sourceY: props.sourceY,
          targetX: props.targetX,
          targetY: props.targetY,
          sourcePosition: Position.Bottom,
          targetPosition: Position.Top,
          borderRadius: RADIUS,
        });
  const portLabel = data.dead
    ? `${data.portLabel ?? data.port} · never taken`
    : data.port !== "next" || data.portLabel
      ? (data.portLabel ?? data.port)
      : null;

  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        style={{
          stroke: data.dead ? "var(--wf-fail)" : "var(--wf-edge)",
          strokeWidth: 1.5,
          ...(data.dead ? { strokeDasharray: "5 4" } : {}),
          ...(data.fromSkipped
            ? { opacity: 0.45, strokeDasharray: "2 3" }
            : {}),
        }}
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-auto absolute flex items-center gap-1"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          {portLabel ? (
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                data.dead
                  ? "border border-solid border-wf-fail/40 bg-card text-wf-fail"
                  : (portClasses(data.port) ?? "bg-muted text-muted-foreground")
              }`}
              title={
                data.dead
                  ? `The source never leaves on "${data.port}", so no run takes this edge`
                  : undefined
              }
            >
              {portLabel}
              {data.condition ? " ?" : ""}
            </span>
          ) : null}
          <AddButton
            title="Insert step"
            presets={STEP_PRESETS}
            showPieces
            onPick={(preset) => handlers?.insertOnEdge(data.edgeId, preset)}
          />
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export function ApLinkEdge(props: EdgeProps) {
  const [path] = getSmoothStepPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    targetX: props.targetX,
    targetY: props.targetY,
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    borderRadius: 15,
  });
  return (
    <BaseEdge
      id={props.id}
      path={path}
      style={{
        stroke: "var(--wf-edge)",
        strokeWidth: 1.5,
        strokeDasharray: "4 3",
      }}
    />
  );
}

export const apEdgeTypes = { apEdge: ApEdge, apLink: ApLinkEdge };
