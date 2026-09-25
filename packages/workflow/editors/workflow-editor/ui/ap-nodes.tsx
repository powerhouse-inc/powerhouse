// Step card + add buttons, ported from the Activepieces builder step-node
// and add-button components (MIT, activepieces packages/web).
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useEffect, useState } from "react";
import {
  ADD_BUTTON_SIZE,
  BIG_ADD_BUTTON_SIZE,
  STEP_HEIGHT,
  STEP_WIDTH,
} from "./ap-layout.js";
import { useBlockMeta } from "./block-meta.js";
import { BlockLogo, BlockSelector } from "./BlockSelector.js";
import { STEP_PRESETS, TRIGGER_PRESETS, type BlockPreset } from "./blocks.js";
import type { BlockForm } from "./forms.js";
import type { StepModel, TriggerModel } from "./model.js";
import {
  MOVE_REJECTION_TEXT,
  setDraggingStep,
  useDraggingStep,
  type MoveRejection,
  type StepMove,
} from "./step-drag.js";
import { missingForBlock } from "./validation.js";

const hiddenHandle = { opacity: 0, pointerEvents: "none" as const };

// Required fields still empty on this block; a loading form counts as none.
function useMissingRequired(
  blockType: string,
  config: unknown,
  connectionId: string | null,
): string[] {
  const [form, setForm] = useState<BlockForm | null | "loading">("loading");
  useEffect(() => {
    const getBlockForm = getCanvasHandlers()?.getBlockForm;
    if (!getBlockForm) {
      // eslint-disable-next-line react-hooks-extra/set-state-in-effect -- no source yet, so there is no form to render
      setForm(null);
      return;
    }
    let alive = true;
    setForm("loading");
    getBlockForm(blockType).then(
      (result) => {
        if (alive) setForm(result);
      },
      () => {
        if (alive) setForm(null);
      },
    );
    return () => {
      alive = false;
    };
  }, [blockType]);
  return missingForBlock(form, config, connectionId);
}

export function ApStepNode(props: NodeProps) {
  const data = props.data as
    | { kind: "trigger"; trigger: TriggerModel }
    | { kind: "step"; step: StepModel };
  const blockType =
    data.kind === "trigger" ? data.trigger.blockType : data.step.blockType;
  // Subscribed, so the piece name replaces the fallback once the catalog lands.
  const meta = useBlockMeta(blockType);
  const title =
    data.kind === "trigger"
      ? meta.displayName
      : data.step.name || data.step.key;
  const missing = useMissingRequired(
    blockType,
    data.kind === "trigger" ? data.trigger.config : data.step.config,
    data.kind === "trigger"
      ? data.trigger.connectionId
      : data.step.connectionId,
  );

  const dragging = useDraggingStep();
  const isDragged = data.kind === "step" && dragging === data.step.id;

  return (
    <div
      style={{ width: STEP_WIDTH, height: STEP_HEIGHT }}
      className={`border-box group relative overflow-visible rounded-md border border-solid bg-card shadow-sm transition-all ${
        props.selected ? "border-wf-run" : "border-foreground/10"
      } ${isDragged ? "opacity-40" : ""} ${
        data.kind === "step"
          ? // nodrag/nopan hand the gesture over: without them React Flow's
            // pane claims the mousedown and the canvas pans instead.
            "nodrag nopan cursor-grab active:cursor-grabbing"
          : ""
      }`}
      draggable={data.kind === "step"}
      onDragStart={(event) => {
        if (data.kind !== "step") return;
        event.dataTransfer.effectAllowed = "move";
        // Firefox ignores a drag with no payload.
        event.dataTransfer.setData("text/plain", data.step.id);
        setDraggingStep(data.step.id);
      }}
      onDragEnd={() => setDraggingStep(undefined)}
    >
      <Handle type="target" position={Position.Top} style={hiddenHandle} />
      <div className="flex h-full items-center gap-3 px-3">
        <BlockLogo blockType={blockType} size={36} />
        <div className="min-w-0 grow">
          <div className="truncate text-sm font-medium text-foreground">
            {title}
          </div>
          <div className="truncate text-xs text-muted-foreground/80">
            {data.kind === "trigger"
              ? meta.subtitle === "Trigger"
                ? "Trigger"
                : meta.subtitle
              : meta.subtitle}
          </div>
        </div>
      </div>
      {missing.length > 0 ? (
        <span
          className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-solid border-card bg-wf-warn"
          title={`Needs a value: ${missing.join(", ")}`}
        />
      ) : null}
      <Handle type="source" position={Position.Bottom} style={hiddenHandle} />
    </div>
  );
}

// Shared with the edges, which label a taken port the same way.
export const PORT_LABEL_CLASSES: Record<string, string> = {
  true: "bg-wf-ok/10 text-wf-ok hover:bg-green-200",
  false: "bg-wf-fail/10 text-wf-fail hover:bg-red-200",
  error: "bg-wf-warn/10 text-wf-warn hover:bg-wf-warn/20",
};

function AddButton(props: {
  size?: number;
  title: string;
  presets: BlockPreset[];
  onPick: (preset: BlockPreset) => void;
  showPieces?: boolean;
  pieceMode?: "actions" | "triggers";
  attachSteps?: StepModel[];
  onAttach?: (stepId: string) => void;
  // Named ports read as their name; an unnamed one is just a plus.
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const size = props.size ?? ADD_BUTTON_SIZE;
  const label = props.label;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <button
        type="button"
        style={label ? { height: size } : { width: size, height: size }}
        // Labelled buttons keep the node's own footprint and overflow it
        // evenly, so the layout still positions them by their centre.
        className={`flex cursor-pointer items-center justify-center rounded-md border border-solid transition-all ${
          label
            ? "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-1.5 text-[10px] font-semibold"
            : ""
        } ${
          open
            ? "border-wf-run bg-wf-run text-card"
            : label
              ? `border-transparent ${PORT_LABEL_CLASSES[label] ?? "bg-muted text-muted-foreground hover:bg-foreground/10"}`
              : "border-foreground/15 bg-card text-foreground hover:border-foreground/25"
        }`}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        {label ? (
          label
        ) : (
          <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24">
            <path
              d="M12 5v14M5 12h14"
              stroke="currentColor"
              strokeWidth={3}
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        )}
      </button>
      {open ? (
        <div
          data-selector-open="true"
          className="absolute left-1/2 top-full z-50 mt-1 -translate-x-1/2"
        >
          <BlockSelector
            title={props.title}
            presets={props.presets}
            showPieces={props.showPieces}
            pieceMode={props.pieceMode}
            attachSteps={props.attachSteps}
            onAttach={
              props.onAttach
                ? (stepId) => {
                    setOpen(false);
                    props.onAttach?.(stepId);
                  }
                : undefined
            }
            onPick={(preset) => {
              setOpen(false);
              props.onPick(preset);
            }}
            onClose={() => setOpen(false)}
          />
        </div>
      ) : null}
    </div>
  );
}

export interface ApCanvasHandlers {
  appendStep: (fromId: string, port: string, preset: BlockPreset) => void;
  insertOnEdge: (edgeId: string, preset: BlockPreset) => void;
  pickTrigger: (preset: BlockPreset) => void;
  // Re-attaching steps that are unreachable from the trigger.
  attachableSteps: (fromId: string) => StepModel[];
  attachStep: (fromId: string, port: string, stepId: string) => void;
  // Dragging a step card onto a slot.
  moveStep: (move: StepMove) => void;
  moveRejection: (move: StepMove) => MoveRejection | null;
  // Form descriptor lookup for the required-fields badge.
  getBlockForm?: (blockType: string) => Promise<BlockForm | null>;
}

let canvasHandlers: ApCanvasHandlers | undefined;

// Node/edge components can't receive functions through the layout data
// cleanly, so the canvas registers its handlers module-side before render.
export function registerCanvasHandlers(handlers: ApCanvasHandlers): void {
  canvasHandlers = handlers;
}

export function getCanvasHandlers(): ApCanvasHandlers | undefined {
  return canvasHandlers;
}

export function ApAppendNode(props: NodeProps) {
  const data = props.data as {
    parentId: string;
    port: string;
    card?: boolean;
  };
  const handlers = getCanvasHandlers();
  const attachSteps = handlers?.attachableSteps(data.parentId);
  const dragging = useDraggingStep();
  const move = dragging
    ? { stepId: dragging, toParentId: data.parentId, port: data.port }
    : undefined;
  const rejection = move ? handlers?.moveRejection(move) : undefined;

  if (move) {
    // While a card is in flight the slot becomes the drop target, sized like
    // the step it would hold. The node keeps its button-sized footprint so the
    // layout still anchors it by the same point.
    return (
      <div
        className="relative"
        style={
          data.card
            ? { width: STEP_WIDTH, height: STEP_HEIGHT }
            : { width: ADD_BUTTON_SIZE, height: ADD_BUTTON_SIZE }
        }
      >
        <Handle type="target" position={Position.Top} style={hiddenHandle} />
        <div
          style={{ width: STEP_WIDTH, height: STEP_HEIGHT }}
          className={`nodrag nopan absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md border-2 border-dashed text-xs font-medium transition-colors ${
            rejection
              ? "border-foreground/10 bg-muted/50 text-muted-foreground/80"
              : "border-wf-run bg-wf-run/10 text-wf-run"
          }`}
          title={rejection ? MOVE_REJECTION_TEXT[rejection] : undefined}
          onDragOver={(event) => {
            if (rejection) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (rejection) return;
            handlers?.moveStep(move);
            setDraggingStep(undefined);
          }}
        >
          {rejection
            ? MOVE_REJECTION_TEXT[rejection]
            : data.port === "next"
              ? "Move here"
              : `Move to ${data.port}`}
        </div>
      </div>
    );
  }

  if (data.card) {
    return (
      <div
        style={{ width: STEP_WIDTH, height: STEP_HEIGHT }}
        className="relative flex items-center justify-center rounded-md border border-dashed border-foreground/15 bg-muted/40"
      >
        <Handle type="target" position={Position.Top} style={hiddenHandle} />
        <span
          className={`absolute left-3 top-3 rounded px-1.5 text-[10px] font-semibold ${
            PORT_LABEL_CLASSES[data.port] ?? "bg-muted text-muted-foreground"
          }`}
        >
          {data.port}
        </span>
        <AddButton
          title={`Add step (${data.port})`}
          presets={STEP_PRESETS}
          showPieces
          attachSteps={attachSteps}
          onAttach={(stepId) =>
            getCanvasHandlers()?.attachStep(data.parentId, data.port, stepId)
          }
          onPick={(preset) =>
            getCanvasHandlers()?.appendStep(data.parentId, data.port, preset)
          }
        />
      </div>
    );
  }

  return (
    <>
      <Handle type="target" position={Position.Top} style={hiddenHandle} />
      <AddButton
        title={data.port === "next" ? "Add step" : `Add step (${data.port})`}
        label={data.port === "next" ? undefined : data.port}
        presets={STEP_PRESETS}
        showPieces
        attachSteps={attachSteps}
        onAttach={(stepId) =>
          getCanvasHandlers()?.attachStep(data.parentId, data.port, stepId)
        }
        onPick={(preset) =>
          getCanvasHandlers()?.appendStep(data.parentId, data.port, preset)
        }
      />
    </>
  );
}

export function ApBigButtonNode(_props: NodeProps) {
  return (
    <div className="flex flex-col items-center gap-2">
      <AddButton
        size={BIG_ADD_BUTTON_SIZE}
        title="Choose a trigger"
        presets={TRIGGER_PRESETS}
        showPieces
        pieceMode="triggers"
        onPick={(preset) => getCanvasHandlers()?.pickTrigger(preset)}
      />
      <span className="text-xs text-muted-foreground/80">Select a trigger</span>
    </div>
  );
}

export { AddButton };

export const apNodeTypes = {
  apStep: ApStepNode,
  apAppend: ApAppendNode,
  apBigButton: ApBigButtonNode,
};
