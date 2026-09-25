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
  getCanvasHandlers,
  PORT_LABEL_CLASSES,
} from "./ap-nodes.js";
import { STEP_PRESETS } from "./blocks.js";

export function ApEdge(props: EdgeProps) {
  const data = props.data as {
    edgeId: string;
    port: string;
    condition: string | null;
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
  const portLabel = data.port !== "next" ? data.port : null;

  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        style={{ stroke: "var(--wf-edge)", strokeWidth: 1.5 }}
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
                PORT_LABEL_CLASSES[portLabel] ??
                "bg-muted text-muted-foreground"
              }`}
            >
              {portLabel}
              {data.condition ? " ?" : ""}
            </span>
          ) : null}
          <AddButton
            title="Insert step"
            presets={STEP_PRESETS}
            showPieces
            onPick={(preset) =>
              getCanvasHandlers()?.insertOnEdge(data.edgeId, preset)
            }
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
