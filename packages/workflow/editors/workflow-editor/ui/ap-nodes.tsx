// Step card + add buttons, ported from the Activepieces builder step-node
// and add-button components (MIT, activepieces packages/web).
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { createContext, useContext, useState } from "react";
import {
  ADD_BUTTON_SIZE,
  BIG_ADD_BUTTON_SIZE,
  STEP_HEIGHT,
  STEP_WIDTH,
} from "./ap-layout.js";
import { useBlockMeta } from "./block-meta.js";
import { BlockLogo, BlockSelector } from "./BlockSelector.js";
import {
  STEP_PRESETS,
  stepBlock,
  TRIGGER_PRESETS,
  triggerBlock,
  type BlockPreset,
  type PickedPreset,
} from "./blocks.js";
import { useDesignTime, useRunById } from "./design-time.js";
import type { StepModel, TriggerModel } from "./model.js";
import {
  MOVE_REJECTION_TEXT,
  setDraggingStep,
  useDraggingStep,
  type MoveRejection,
  type StepMove,
} from "./step-drag.js";
import { isTestableTrigger, testState } from "./test-state.js";
import { useBlockCheck } from "./use-validity.js";
import {
  useResolution,
  versionBadge,
  type VersionBadgeView,
  type VersionTone,
} from "./version-badge.js";

const hiddenHandle = { opacity: 0, pointerEvents: "none" as const };

type NodeBadge =
  | { kind: "invalid"; issues: string[] }
  | { kind: "incomplete"; missing: string[] }
  | { kind: "test"; stale: boolean }
  | { kind: "failed" }
  | { kind: "passed" }
  | null;

// Inline beside the title, so no zoom level clips it against the card edge.
const BADGE_CLASS =
  "inline-flex shrink-0 items-center rounded-full px-1.5 text-[10px] font-medium leading-4";

function badgeTitle(badge: NonNullable<NodeBadge>): string {
  switch (badge.kind) {
    case "invalid":
      return badge.issues.join("\n");
    case "incomplete":
      return `Needs a value: ${badge.missing.join(", ")}`;
    case "test":
      return badge.stale ? "Changed since its last test" : "Not tested yet";
    case "failed":
      return "The last test failed";
    case "passed":
      return "Tested";
  }
}

// Which one badge a crowded title keeps; the other goes in its tooltip.
const TEST_SEVERITY = {
  passed: 0,
  test: 2,
  incomplete: 3,
  failed: 4,
  invalid: 6,
};
const VERSION_SEVERITY: Record<VersionTone, number> = {
  neutral: 1,
  warn: 3,
  fail: 5,
};

const VERSION_CLASS: Record<VersionTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  warn: "bg-wf-warn/15 text-wf-warn",
  fail: "bg-wf-fail/10 text-wf-fail",
};

// Activepieces' order: incomplete first, then the test. A version badge
// shows instead only when it is the more severe.
function Badge(props: { badge: NodeBadge; version: VersionBadgeView | null }) {
  const { badge, version } = props;
  if (
    version &&
    (!badge || VERSION_SEVERITY[version.tone] > TEST_SEVERITY[badge.kind])
  ) {
    return (
      <span
        data-testid="version-badge"
        className={`${BADGE_CLASS} ${VERSION_CLASS[version.tone]}`}
        title={badge ? `${version.title}\n${badgeTitle(badge)}` : version.title}
      >
        {version.label}
      </span>
    );
  }
  if (!badge) return null;
  const title = version
    ? `${badgeTitle(badge)}\n${version.title}`
    : badgeTitle(badge);
  switch (badge.kind) {
    case "invalid":
      return (
        <span
          className={`${BADGE_CLASS} bg-wf-fail/10 text-wf-fail`}
          title={title}
        >
          Miswired
        </span>
      );
    case "incomplete":
      return (
        <span
          className={`${BADGE_CLASS} bg-wf-warn/15 text-wf-warn`}
          title={title}
        >
          Incomplete
        </span>
      );
    case "test":
      return (
        <span
          className={`${BADGE_CLASS} bg-muted text-muted-foreground`}
          title={title}
        >
          Test me
        </span>
      );
    case "failed":
      return (
        <span
          className={`${BADGE_CLASS} bg-wf-fail/10 text-wf-fail`}
          title={title}
        >
          Failed
        </span>
      );
    case "passed":
      return (
        <span
          className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-wf-ok/15 text-wf-ok"
          title={title}
          aria-label="Tested"
        >
          <svg viewBox="0 0 24 24" className="h-2.5 w-2.5">
            <path
              d="M5 12l5 5 9-10"
              stroke="currentColor"
              strokeWidth={3}
              fill="none"
              strokeLinecap="round"
            />
          </svg>
        </span>
      );
  }
}

export function ApStepNode(props: NodeProps) {
  const data = props.data as (
    | { kind: "trigger"; trigger: TriggerModel }
    | { kind: "step"; step: StepModel }
  ) & { outgoingPorts?: string[] };
  const ref =
    data.kind === "trigger" ? triggerBlock(data.trigger) : stepBlock(data.step);
  // Subscribed, so the piece name replaces the fallback once the catalog lands.
  const meta = useBlockMeta(ref);
  const title =
    data.kind === "trigger"
      ? meta.displayName
      : data.step.name || data.step.key;
  const block = data.kind === "trigger" ? data.trigger : data.step;
  const skipped = data.kind === "step" && data.step.skip === true;
  const check = useBlockCheck({
    ...block,
    block: ref,
    skip: skipped,
    outgoingPorts: data.outgoingPorts,
  });

  const designTime = useDesignTime();
  const testable =
    data.kind === "trigger"
      ? isTestableTrigger(ref) && Boolean(designTime?.testTrigger)
      : Boolean(designTime?.testStep);
  const testRun = useRunById(testable ? block.lastTest?.runId : null);
  const tested = testable ? testState(block, testRun?.status) : null;
  // No tick until the run says it didn't fail.
  const test = tested === "passed" && testRun === undefined ? null : tested;
  const badge: NodeBadge = skipped
    ? null
    : check.issues.length > 0
      ? { kind: "invalid", issues: check.issues }
      : check.missing && check.missing.length > 0
        ? { kind: "incomplete", missing: check.missing }
        : test === "never" || test === "stale"
          ? { kind: "test", stale: test === "stale" }
          : test === "failed"
            ? { kind: "failed" }
            : test === "passed"
              ? { kind: "passed" }
              : null;

  const resolution = useResolution(block.id, ref);
  const version = skipped ? null : versionBadge(resolution);

  const dragging = useDraggingStep();
  const isDragged = data.kind === "step" && dragging === data.step.id;

  return (
    <div
      style={{ width: STEP_WIDTH, height: STEP_HEIGHT }}
      className={`border-box group relative overflow-visible rounded-md border border-solid bg-card shadow-sm transition-all ${
        props.selected ? "border-wf-run" : "border-foreground/10"
      } ${isDragged ? "opacity-40" : ""} ${skipped ? "border-dashed" : ""} ${
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
      <div
        className={`flex h-full items-center gap-3 px-3 ${skipped ? "opacity-50 grayscale" : ""}`}
      >
        <BlockLogo block={ref} size={36} />
        <div className="min-w-0 grow">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium text-foreground">
              {title}
            </span>
            {skipped ? (
              <span className="shrink-0 rounded bg-muted px-1 text-[10px] font-medium text-muted-foreground">
                Skipped
              </span>
            ) : null}
            <Badge badge={badge} version={version} />
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
      <Handle type="source" position={Position.Bottom} style={hiddenHandle} />
    </div>
  );
}

// Shared with the edges, which label a taken port the same way.
export const PORT_LABEL_CLASSES: Record<string, string> = {
  true: "bg-wf-ok/10 text-wf-ok hover:bg-green-200",
  // False is an ordinary outcome; red is kept for a step that failed.
  false: "bg-foreground/5 text-muted-foreground hover:bg-foreground/10",
  error: "bg-wf-fail/10 text-wf-fail hover:bg-red-200",
};

function AddButton(props: {
  size?: number;
  title: string;
  presets: BlockPreset[];
  onPick: (preset: PickedPreset) => void;
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
    <div
      data-picker-root
      className="relative"
      style={{ width: size, height: size }}
    >
      <button
        type="button"
        aria-label={props.title}
        aria-expanded={open}
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
  appendStep: (fromId: string, port: string, preset: PickedPreset) => void;
  insertOnEdge: (edgeId: string, preset: PickedPreset) => void;
  pickTrigger: (preset: PickedPreset) => void;
  // Re-attaching steps that are unreachable from the trigger.
  attachableSteps: (fromId: string) => StepModel[];
  attachStep: (fromId: string, port: string, stepId: string) => void;
  // Dragging a step card onto a slot.
  moveStep: (move: StepMove) => void;
  moveRejection: (move: StepMove) => MoveRejection | null;
}

// Node/edge components can't receive functions through the layout data
// cleanly; they render inside ReactFlow, under the canvas's provider.
const CanvasHandlersContext = createContext<ApCanvasHandlers | undefined>(
  undefined,
);

export const CanvasHandlersProvider = CanvasHandlersContext.Provider;

export function useCanvasHandlers(): ApCanvasHandlers | undefined {
  return useContext(CanvasHandlersContext);
}

export function ApAppendNode(props: NodeProps) {
  const data = props.data as {
    parentId: string;
    port: string;
    card?: boolean;
    hint?: boolean;
  };
  const handlers = useCanvasHandlers();
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
            handlers?.attachStep(data.parentId, data.port, stepId)
          }
          onPick={(preset) =>
            handlers?.appendStep(data.parentId, data.port, preset)
          }
        />
      </div>
    );
  }

  return (
    <>
      <Handle type="target" position={Position.Top} style={hiddenHandle} />
      {data.hint ? (
        <span className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap text-xs text-muted-foreground">
          Add your first step with +
        </span>
      ) : null}
      <AddButton
        title={data.port === "next" ? "Add step" : `Add step (${data.port})`}
        label={data.port === "next" ? undefined : data.port}
        presets={STEP_PRESETS}
        showPieces
        attachSteps={attachSteps}
        onAttach={(stepId) =>
          handlers?.attachStep(data.parentId, data.port, stepId)
        }
        onPick={(preset) =>
          handlers?.appendStep(data.parentId, data.port, preset)
        }
      />
    </>
  );
}

export function ApBigButtonNode(_props: NodeProps) {
  const handlers = useCanvasHandlers();
  return (
    <div className="flex flex-col items-center gap-2">
      <AddButton
        size={BIG_ADD_BUTTON_SIZE}
        title="Choose a trigger"
        presets={TRIGGER_PRESETS}
        showPieces
        pieceMode="triggers"
        onPick={(preset) => handlers?.pickTrigger(preset)}
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
