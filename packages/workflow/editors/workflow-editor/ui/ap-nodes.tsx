// Step card + add buttons, ported from the Activepieces builder step-node
// and add-button components (MIT, activepieces packages/web).
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useState } from "react";
import {
  ADD_BUTTON_SIZE,
  BIG_ADD_BUTTON_SIZE,
  STEP_HEIGHT,
  STEP_WIDTH,
} from "./ap-layout.js";
import { blockMeta } from "./block-meta.js";
import { BlockLogo, BlockSelector } from "./BlockSelector.js";
import { STEP_PRESETS, TRIGGER_PRESETS, type BlockPreset } from "./blocks.js";
import type { StepModel, TriggerModel } from "./model.js";

const hiddenHandle = { opacity: 0, pointerEvents: "none" as const };

export function ApStepNode(props: NodeProps) {
  const data = props.data as
    | { kind: "trigger"; trigger: TriggerModel }
    | { kind: "step"; step: StepModel };
  const blockType =
    data.kind === "trigger" ? data.trigger.blockType : data.step.blockType;
  const meta = blockMeta(blockType);
  const title =
    data.kind === "trigger"
      ? meta.displayName
      : data.step.name || data.step.key;

  return (
    <div
      style={{ width: STEP_WIDTH, height: STEP_HEIGHT }}
      className={`border-box group relative overflow-visible rounded-md border border-solid bg-white shadow-sm transition-all ${
        props.selected ? "border-blue-500" : "border-slate-200"
      }`}
    >
      <Handle type="target" position={Position.Top} style={hiddenHandle} />
      <div className="flex h-full items-center gap-3 px-3">
        <BlockLogo blockType={blockType} size={36} />
        <div className="min-w-0 grow">
          <div className="truncate text-sm font-medium text-slate-800">
            {title}
          </div>
          <div className="truncate text-xs text-slate-400">
            {data.kind === "trigger"
              ? `Trigger · ${meta.subtitle}`
              : `${data.step.key} · ${meta.subtitle}`}
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} style={hiddenHandle} />
    </div>
  );
}

function AddButton(props: {
  size?: number;
  title: string;
  presets: BlockPreset[];
  onPick: (preset: BlockPreset) => void;
  showPieces?: boolean;
  pieceMode?: "actions" | "triggers";
  attachSteps?: StepModel[];
  onAttach?: (stepId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const size = props.size ?? ADD_BUTTON_SIZE;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <button
        type="button"
        style={{ width: size, height: size }}
        className={`flex cursor-pointer items-center justify-center rounded-md border border-solid transition-all ${
          open
            ? "border-blue-500 bg-blue-500 text-white"
            : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
        }`}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24">
          <path
            d="M12 5v14M5 12h14"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            fill="none"
          />
        </svg>
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
  const data = props.data as { parentId: string; port: string };
  const attachSteps = getCanvasHandlers()?.attachableSteps(data.parentId);
  return (
    <>
      <Handle type="target" position={Position.Top} style={hiddenHandle} />
      <AddButton
        title={data.port === "next" ? "Add step" : `Add step (${data.port})`}
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
      <span className="text-xs text-slate-400">Select a trigger</span>
    </div>
  );
}

export { AddButton };

export const apNodeTypes = {
  apStep: ApStepNode,
  apAppend: ApAppendNode,
  apBigButton: ApBigButtonNode,
};
