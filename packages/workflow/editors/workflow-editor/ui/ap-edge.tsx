// Edge with the mid-line add button, ported from the Activepieces builder
// edges/add-button (MIT, activepieces packages/web).
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  Position,
  type EdgeProps,
} from "@xyflow/react";
import {
  AddButton,
  PORT_LABEL_CLASSES,
  useCanvasHandlers,
} from "./ap-nodes.js";
import { STEP_PRESETS } from "./blocks.js";

export function ApEdge(props: EdgeProps) {
  const handlers = useCanvasHandlers();
  const data = props.data as {
    edgeId: string;
    port: string;
    condition: string | null;
    fromSkipped?: boolean;
    dead?: boolean;
  };
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    targetX: props.targetX,
    targetY: props.targetY,
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    borderRadius: 15,
  });
  const portLabel = data.dead
    ? `${data.port} · never taken`
    : data.port !== "next"
      ? data.port
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
                  : (PORT_LABEL_CLASSES[portLabel] ??
                    "bg-muted text-muted-foreground")
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
