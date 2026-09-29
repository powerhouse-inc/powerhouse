import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from "@xyflow/react";
import { useCallback, useMemo, useState } from "react";
import { apEdgeTypes } from "./ap-edge.js";
import { attachableSteps, layoutWorkflow } from "./ap-layout.js";
import {
  flowPorts,
  knownPorts,
} from "@powerhousedao/pieces-framework/workflow";
import {
  useBlockFormLoader,
  useBlockPorts,
  useCachedBlockForm,
} from "./design-time.js";
import { moveRejection } from "./step-drag.js";
import type { AddedBlock } from "./add-follow-up.js";
import { withPropDefaults } from "./prop-defaults.js";
import {
  apNodeTypes,
  CanvasHandlersProvider,
  type ApCanvasHandlers,
} from "./ap-nodes.js";
import {
  stepBlock,
  stepFields,
  triggerBlock,
  triggerFields,
  type PickedPreset,
} from "./blocks.js";
import {
  CanvasContextMenu,
  type CanvasMenuState,
} from "./CanvasContextMenu.js";
import type { ContextMenuActionId, ContextMenuTarget } from "./canvas-menu.js";
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
}

function presetToInput(
  preset: PickedPreset,
  model: WorkflowModel,
  config: unknown,
): AddStepInputModel {
  return {
    key: uniqueStepKey(
      model.steps.map((step) => step.key),
      preset.label,
    ),
    name: preset.label,
    ...stepFields(preset.block),
    config,
  };
}

const MINIMAP_MIN_STEPS = 8;

const MINIMAP_NODE_COLOR = (node: Node) =>
  node.type === "apStep" ? "var(--wf-edge)" : "transparent";

export function WorkflowCanvas({
  model,
  callbacks,
  onSelect,
}: WorkflowCanvasProps) {
  const blocks = useMemo(
    () => [
      ...(model.trigger ? [triggerBlock(model.trigger)] : []),
      ...model.steps.map(stepBlock),
    ],
    [model],
  );
  const portsOf = useBlockPorts(blocks);
  const loadForm = useBlockFormLoader();
  const cachedForm = useCachedBlockForm();
  const portsKey = blocks.map((block) => portsOf(block)?.join("|")).join(",");
  const { nodes, edges } = useMemo(
    () => layoutWorkflow(model, portsOf),
    // portsKey stands for what portsOf answers.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [model, portsKey],
  );
  // Local-first: a block is added at once, with its piece's defaults when
  // the form is cached; otherwise they follow once it loads. Adding selects
  // the block, which opens its panel.
  const add = useCallback(
    (
      preset: PickedPreset,
      commit: (config: unknown) => AddedBlock | undefined,
    ) => {
      const cached = cachedForm(preset.block);
      const added = commit(
        cached
          ? withPropDefaults(cached.props, preset.defaultConfig)
          : preset.defaultConfig,
      );
      if (!added) return;
      onSelect(added.id);
      if (cached) return;
      void loadForm(preset.block).then((form) => {
        if (form) callbacks.completeBlock(added, form);
      });
    },
    [cachedForm, loadForm, callbacks, onSelect],
  );
  // The inserted block continues on its first flow port, known from its kind
  // until the form loads; the follow-up corrects it if the form disagrees.
  const insertOnEdge = useCallback(
    (edgeId: string, preset: PickedPreset) => {
      const ports = cachedForm(preset.block)?.ports ?? knownPorts(preset.block);
      const port = flowPorts(ports)[0];
      if (!port) {
        console.error(
          `${preset.block.pieceName} ${preset.block.name} declares no port to continue on`,
        );
        return;
      }
      add(preset, (config) =>
        callbacks.insertStepOnEdge(
          edgeId,
          presetToInput(preset, model, config),
          port,
        ),
      );
    },
    [add, cachedForm, callbacks, model],
  );
  const [menu, setMenu] = useState<CanvasMenuState | null>(null);
  const [flow, setFlow] = useState<ReactFlowInstance | null>(null);
  const appendStep = (fromId: string, port: string, preset: PickedPreset) =>
    add(preset, (config) =>
      callbacks.appendStep(fromId, port, presetToInput(preset, model, config)),
    );
  const pickTrigger = (preset: PickedPreset) =>
    add(preset, (config) =>
      callbacks.setTrigger({ ...triggerFields(preset.block), config }),
    );

  const handlers = useMemo<ApCanvasHandlers>(
    () => ({
      appendStep: (fromId, port, preset) =>
        add(preset, (config) =>
          callbacks.appendStep(
            fromId,
            port,
            presetToInput(preset, model, config),
          ),
        ),
      insertOnEdge,
      pickTrigger: (preset) =>
        add(preset, (config) =>
          callbacks.setTrigger({ ...triggerFields(preset.block), config }),
        ),
      attachableSteps: (fromId) => attachableSteps(model, fromId),
      moveStep: (move) => callbacks.moveStep(move),
      moveRejection: (move) => moveRejection(model, move),
      attachStep: (fromId, port, stepId) =>
        callbacks.addEdge({ from: fromId, to: stepId, port }),
    }),
    [callbacks, model, add, insertOnEdge],
  );

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

  const onMenuAction = (action: ContextMenuActionId, preset?: PickedPreset) => {
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
        if (preset && fromId) appendStep(fromId, "next", preset);
        break;
      }
      case "duplicate":
        if (target.kind === "step") callbacks.duplicateStep(target.id);
        break;
      case "toggleSkip":
        if (target.kind === "step") {
          const step = model.steps.find((entry) => entry.id === target.id);
          if (step) callbacks.updateStep({ id: step.id, skip: !step.skip });
        }
        break;
      case "removeStep":
        if (target.kind === "step") {
          callbacks.removeStep(target.id);
          onSelect(null);
        }
        break;
      case "changeTrigger":
        if (preset) pickTrigger(preset);
        break;
      case "removeTrigger":
        callbacks.clearTrigger();
        onSelect(null);
        break;
      case "insertStep":
        if (preset && target.kind === "edge") insertOnEdge(target.id, preset);
        break;
      case "removeEdge":
        if (target.kind === "edge") callbacks.removeEdge(target.id);
        break;
      case "addStep":
        if (preset) {
          const position = flow?.screenToFlowPosition(point);
          add(preset, (config) =>
            callbacks.addStep({
              ...presetToInput(preset, model, config),
              position,
            }),
          );
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
    <CanvasHandlersProvider value={handlers}>
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
            portsOf={portsOf}
            state={menu}
            model={model}
            onAction={onMenuAction}
            onClose={() => setMenu(null)}
          />
        ) : null}
      </div>
    </CanvasHandlersProvider>
  );
}
