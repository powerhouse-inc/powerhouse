import { Background, Controls, ReactFlow } from "@xyflow/react";
import { useEffect, useMemo } from "react";
import { apEdgeTypes } from "./ap-edge.js";
import { layoutWorkflow } from "./ap-layout.js";
import { apNodeTypes, registerCanvasHandlers } from "./ap-nodes.js";
import type { BlockPreset } from "./blocks.js";
import type {
  AddStepInputModel,
  WorkflowEditorCallbacks,
  WorkflowModel,
} from "./model.js";

interface WorkflowCanvasProps {
  model: WorkflowModel;
  callbacks: WorkflowEditorCallbacks;
  onSelect: (id: string | null) => void;
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

export function WorkflowCanvas({
  model,
  callbacks,
  onSelect,
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
    });
  }, [callbacks, model]);

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
      nodesDraggable={false}
      nodesConnectable={false}
      deleteKeyCode={null}
      zoomOnDoubleClick={false}
      fitView
      fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={16} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
