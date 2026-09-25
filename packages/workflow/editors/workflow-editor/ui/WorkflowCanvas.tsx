import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from "@xyflow/react";
import { useEffect, useMemo, useState } from "react";
import { apEdgeTypes } from "./ap-edge.js";
import { attachableSteps, layoutWorkflow } from "./ap-layout.js";
import { moveRejection } from "./step-drag.js";
import { apNodeTypes, registerCanvasHandlers } from "./ap-nodes.js";
import type { BlockPreset } from "./blocks.js";
import {
  CanvasContextMenu,
  type CanvasMenuState,
} from "./CanvasContextMenu.js";
import type { ContextMenuActionId, ContextMenuTarget } from "./canvas-menu.js";
import type { DesignTimeService } from "./forms.js";
import {
  uniqueStepKey,
  type AddStepInputModel,
  type WorkflowEditorCallbacks,
  type WorkflowModel,
} from "./model.js";

interface WorkflowCanvasProps {
  model: WorkflowModel;
  callbacks: WorkflowEditorCallbacks;
  onSelect: (id: string | null) => void;
  designTime?: DesignTimeService;
}

function presetToInput(
  preset: BlockPreset,
  model: WorkflowModel,
): AddStepInputModel {
  return {
    key: uniqueStepKey(
      model.steps.map((step) => step.key),
      preset.label,
    ),
    name: preset.label,
    blockType: preset.blockType,
    config: preset.defaultConfig,
  };
}

const MINIMAP_MIN_STEPS = 8;

const MINIMAP_NODE_COLOR = (node: Node) =>
  node.type === "apStep" ? "var(--wf-edge)" : "transparent";

export function WorkflowCanvas({
  model,
  callbacks,
  onSelect,
  designTime,
}: WorkflowCanvasProps) {
  const { nodes, edges } = useMemo(() => layoutWorkflow(model), [model]);
  const [menu, setMenu] = useState<CanvasMenuState | null>(null);
  const [flow, setFlow] = useState<ReactFlowInstance | null>(null);

  useEffect(() => {
    registerCanvasHandlers({
      appendStep: (fromId, port, preset) =>
        callbacks.appendStep(fromId, port, presetToInput(preset, model)),
      insertOnEdge: (edgeId, preset) =>
        callbacks.insertStepOnEdge(edgeId, presetToInput(preset, model)),
      pickTrigger: (preset) =>
        callbacks.setTrigger({
          blockType: preset.blockType,
          config: preset.defaultConfig,
        }),
      attachableSteps: (fromId) => attachableSteps(model, fromId),
      moveStep: (move) => callbacks.moveStep(move),
      moveRejection: (move) => moveRejection(model, move),
      attachStep: (fromId, port, stepId) =>
        callbacks.addEdge({ from: fromId, to: stepId, port }),
      getBlockForm: designTime
        ? (blockType) => designTime.getBlockForm(blockType)
        : undefined,
    });
  }, [callbacks, model, designTime]);

  // Delete/Backspace on a selection: steps go through removeStep (which
  // drops their edges); only edges between surviving steps are removed here.
  const onDelete = ({
    nodes: deletedNodes,
    edges: deletedEdges,
  }: {
    nodes: Node[];
    edges: Edge[];
  }) => {
    const stepIds = new Set(model.steps.map((step) => step.id));
    const removedSteps = new Set(
      deletedNodes
        .filter((node) => node.type === "apStep" && stepIds.has(node.id))
        .map((node) => node.id),
    );
    for (const id of removedSteps) callbacks.removeStep(id);
    for (const edge of deletedEdges) {
      if (edge.type !== "apEdge") continue;
      if (removedSteps.has(edge.source) || removedSteps.has(edge.target)) {
        continue;
      }
      if (model.edges.some((entry) => entry.id === edge.id)) {
        callbacks.removeEdge(edge.id);
      }
    }
    if (removedSteps.size > 0) onSelect(null);
  };

  const openMenu = (
    event: { clientX: number; clientY: number; preventDefault: () => void },
    target: ContextMenuTarget,
  ) => {
    event.preventDefault();
    setMenu({ target, point: { x: event.clientX, y: event.clientY } });
  };

  const onMenuAction = (action: ContextMenuActionId, preset?: BlockPreset) => {
    if (!menu) return;
    const target = menu.target;
    const point = menu.point;
    setMenu(null);
    switch (action) {
      case "open":
        onSelect(
          target.kind === "step" ? target.id : (model.trigger?.id ?? null),
        );
        break;
      case "addBelow": {
        const fromId = target.kind === "step" ? target.id : model.trigger?.id;
        if (preset && fromId) {
          callbacks.appendStep(fromId, "next", presetToInput(preset, model));
        }
        break;
      }
      case "duplicate":
        if (target.kind === "step") callbacks.duplicateStep(target.id);
        break;
      case "removeStep":
        if (target.kind === "step") {
          callbacks.removeStep(target.id);
          onSelect(null);
        }
        break;
      case "changeTrigger":
        if (preset) {
          callbacks.setTrigger({
            blockType: preset.blockType,
            config: preset.defaultConfig,
          });
        }
        break;
      case "removeTrigger":
        callbacks.clearTrigger();
        onSelect(null);
        break;
      case "insertStep":
        if (preset && target.kind === "edge") {
          callbacks.insertStepOnEdge(target.id, presetToInput(preset, model));
        }
        break;
      case "removeEdge":
        if (target.kind === "edge") callbacks.removeEdge(target.id);
        break;
      case "addStep":
        if (preset) {
          callbacks.addStep({
            ...presetToInput(preset, model),
            position: flow?.screenToFlowPosition(point),
          });
        }
        break;
      case "selectAll":
        flow?.setNodes((current) =>
          current.map((node) =>
            node.type === "apStep" ? { ...node, selected: true } : node,
          ),
        );
        break;
      case "fitView":
        void flow?.fitView({ padding: 0.25, maxZoom: 1 });
        break;
    }
  };

  return (
    <div
      className="relative h-full w-full"
      onContextMenu={(event) => event.preventDefault()}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={apNodeTypes}
        edgeTypes={apEdgeTypes}
        onInit={setFlow}
        onNodeClick={(_event, node) => {
          setMenu(null);
          if (node.type === "apStep") onSelect(node.id);
        }}
        onPaneClick={() => {
          setMenu(null);
          onSelect(null);
        }}
        onNodeContextMenu={(event, node) =>
          openMenu(
            event,
            node.type !== "apStep"
              ? { kind: "pane" }
              : node.id === model.trigger?.id
                ? { kind: "trigger" }
                : { kind: "step", id: node.id },
          )
        }
        onEdgeContextMenu={(event, edge) =>
          openMenu(
            event,
            edge.type === "apEdge"
              ? { kind: "edge", id: edge.id }
              : { kind: "pane" },
          )
        }
        onPaneContextMenu={(event) => openMenu(event, { kind: "pane" })}
        onMove={() => setMenu(null)}
        onDelete={onDelete}
        nodesDraggable={false}
        nodesConnectable={false}
        deleteKeyCode={["Backspace", "Delete"]}
        zoomOnDoubleClick={false}
        fitView
        fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} />
        <Controls showInteractive={false} />
        {/* Only worth the space once the flow outgrows the viewport. */}
        {model.steps.length > MINIMAP_MIN_STEPS ? (
          <MiniMap
            pannable
            zoomable
            nodeColor={MINIMAP_NODE_COLOR}
            nodeStrokeWidth={0}
            style={{ width: 140, height: 90 }}
          />
        ) : null}
      </ReactFlow>
      {menu ? (
        <CanvasContextMenu
          state={menu}
          model={model}
          onAction={onMenuAction}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </div>
  );
}
