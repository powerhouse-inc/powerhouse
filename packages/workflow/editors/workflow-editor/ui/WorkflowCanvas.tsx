import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import { useEffect, useMemo } from "react";
import { apEdgeTypes } from "./ap-edge.js";
import { attachableSteps, layoutWorkflow } from "./ap-layout.js";
import { apNodeTypes, registerCanvasHandlers } from "./ap-nodes.js";
import type { BlockPreset } from "./blocks.js";
import type { DesignTimeService } from "./forms.js";
import type {
  AddStepInputModel,
  WorkflowEditorCallbacks,
  WorkflowModel,
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
  const base =
    preset.label
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "_")
      .replaceAll(/^_+|_+$/g, "") || "step";
  const keys = new Set(model.steps.map((step) => step.key));
  let key = base;
  let suffix = 2;
  while (keys.has(key)) key = `${base}_${suffix++}`;
  return {
    key,
    name: preset.label,
    blockType: preset.blockType,
    config: preset.defaultConfig,
  };
}

const MINIMAP_NODE_COLOR = (node: Node) =>
  node.type === "apStep" ? "#cbd5e1" : "transparent";

export function WorkflowCanvas({
  model,
  callbacks,
  onSelect,
  designTime,
}: WorkflowCanvasProps) {
  const { nodes, edges } = useMemo(() => layoutWorkflow(model), [model]);

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

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={apNodeTypes}
      edgeTypes={apEdgeTypes}
      onNodeClick={(_event, node) => {
        if (node.type === "apStep") onSelect(node.id);
      }}
      onPaneClick={() => onSelect(null)}
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
      <MiniMap
        pannable
        zoomable
        nodeColor={MINIMAP_NODE_COLOR}
        nodeStrokeWidth={0}
        style={{ width: 140, height: 90 }}
      />
    </ReactFlow>
  );
}
