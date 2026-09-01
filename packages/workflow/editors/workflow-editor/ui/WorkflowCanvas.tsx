import {
  Background,
  Controls,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo } from "react";
import type { WorkflowEditorCallbacks, WorkflowModel } from "./model.js";
import { nodeTypes } from "./nodes.js";

interface WorkflowCanvasProps {
  model: WorkflowModel;
  callbacks: WorkflowEditorCallbacks;
  onSelect: (id: string | null) => void;
}

function toNodes(model: WorkflowModel): Node[] {
  const nodes: Node[] = [];
  if (model.trigger) {
    nodes.push({
      id: model.trigger.id,
      type: "trigger",
      position: { x: 40, y: 20 },
      data: { trigger: model.trigger },
      deletable: false,
    });
  }
  model.steps.forEach((step, index) => {
    nodes.push({
      id: step.id,
      type: "step",
      position: step.position ?? {
        x: 60 + (index % 3) * 240,
        y: 140 + Math.floor(index / 3) * 130,
      },
      data: { step },
    });
  });
  return nodes;
}

function toEdges(model: WorkflowModel): Edge[] {
  return model.edges.map((edge) => ({
    id: edge.id,
    source: edge.from,
    target: edge.to,
    sourceHandle: edge.port,
    targetHandle: "in",
    label: edge.condition ? `${edge.port} ?` : edge.port,
    animated: edge.port === "next",
  }));
}

export function WorkflowCanvas({
  model,
  callbacks,
  onSelect,
}: WorkflowCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(toNodes(model));
  const [edges, setEdges, onEdgesChange] = useEdgesState(toEdges(model));

  // The document is the source of truth; rebuild whenever it changes.
  useEffect(() => {
    setNodes(toNodes(model));
    setEdges(toEdges(model));
  }, [model, setNodes, setEdges]);

  const triggerId = model.trigger?.id;

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      if (connection.target === triggerId) return;
      callbacks.addEdge({
        from: connection.source,
        to: connection.target,
        port: connection.sourceHandle ?? "next",
      });
    },
    [callbacks, triggerId],
  );

  const onNodeDragStop = useCallback(
    (_event: unknown, node: Node) => {
      if (node.id === triggerId) return;
      callbacks.updateStep({
        id: node.id,
        position: { x: node.position.x, y: node.position.y },
      });
    },
    [callbacks, triggerId],
  );

  const onNodesDelete = useCallback(
    (deleted: Node[]) => {
      for (const node of deleted) {
        if (node.id !== triggerId) callbacks.removeStep(node.id);
      }
    },
    [callbacks, triggerId],
  );

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      for (const edge of deleted) callbacks.removeEdge(edge.id);
    },
    [callbacks],
  );

  const fitViewOptions = useMemo(() => ({ padding: 0.2, maxZoom: 1 }), []);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeDragStop={onNodeDragStop}
      onNodesDelete={onNodesDelete}
      onEdgesDelete={onEdgesDelete}
      onNodeClick={(_event, node) => onSelect(node.id)}
      onPaneClick={() => onSelect(null)}
      fitView
      fitViewOptions={fitViewOptions}
      proOptions={{ hideAttribution: true }}
      deleteKeyCode={["Backspace", "Delete"]}
    >
      <Background gap={16} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
