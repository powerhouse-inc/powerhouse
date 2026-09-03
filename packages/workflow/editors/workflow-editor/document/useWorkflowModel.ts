// The only file coupling the editor UI to the Powerhouse document: maps the
// workflow document state to the plain view model and callbacks to actions.
import { generateId } from "document-model";
import {
  actions,
  useSelectedWorkflowDocument,
  type WorkflowState,
} from "document-models/workflow";
import { useMemo } from "react";
import type { WorkflowEditorCallbacks, WorkflowModel } from "../ui/model.js";

function toModel(state: WorkflowState): WorkflowModel {
  return {
    name: state.name,
    status: state.status,
    version: state.version,
    trigger: state.trigger
      ? {
          id: state.trigger.id,
          blockType: state.trigger.blockType,
          config: state.trigger.config,
          connectionId: state.trigger.connectionId ?? null,
        }
      : null,
    steps: state.steps.map((step) => ({
      id: step.id,
      key: step.key,
      name: step.name,
      blockType: step.blockType,
      connectionId: step.connectionId ?? null,
      config: step.config,
      timeoutSeconds: step.timeoutSeconds ?? null,
      position: step.position
        ? { x: step.position.x, y: step.position.y }
        : null,
    })),
    edges: state.edges.map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      port: edge.port,
      condition: edge.condition ?? null,
    })),
  };
}

export function useWorkflowModel(): {
  model: WorkflowModel;
  callbacks: WorkflowEditorCallbacks;
} {
  const [document, dispatch] = useSelectedWorkflowDocument();
  const state = document.state.global;

  const model = useMemo(() => toModel(state), [state]);

  const callbacks = useMemo<WorkflowEditorCallbacks>(
    () => ({
      setStatus: (status) => dispatch(actions.setWorkflowStatus({ status })),
      setTrigger: (input) =>
        dispatch(
          actions.setTrigger({
            // Keep the trigger id stable so edges from it survive edits.
            id: state.trigger?.id ?? generateId(),
            blockType: input.blockType,
            config: input.config,
            connectionId: input.connectionId,
          }),
        ),
      clearTrigger: () => dispatch(actions.clearTrigger({})),
      addStep: (input) =>
        dispatch(
          actions.addStep({
            id: generateId(),
            key: input.key,
            name: input.name,
            blockType: input.blockType,
            config: input.config,
            position: input.position,
          }),
        ),
      updateStep: (input) => dispatch(actions.updateStep(input)),
      removeStep: (id) => dispatch(actions.removeStep({ id })),
      addEdge: (input) =>
        dispatch(
          actions.addEdge({
            id: generateId(),
            from: input.from,
            to: input.to,
            port: input.port,
            condition: input.condition,
          }),
        ),
      removeEdge: (id) => dispatch(actions.removeEdge({ id })),
      insertStepOnEdge: (edgeId, input) => {
        const edge = state.edges.find((entry) => entry.id === edgeId);
        if (!edge) return;
        const stepId = generateId();
        dispatch(
          actions.addStep({
            id: stepId,
            key: input.key,
            name: input.name,
            blockType: input.blockType,
            config: input.config,
          }),
        );
        dispatch(actions.removeEdge({ id: edgeId }));
        dispatch(
          actions.addEdge({
            id: generateId(),
            from: edge.from,
            to: stepId,
            port: edge.port,
            condition: edge.condition,
          }),
        );
        dispatch(
          actions.addEdge({
            id: generateId(),
            from: stepId,
            to: edge.to,
            port: "next",
          }),
        );
      },
      appendStep: (fromId, port, input) => {
        const stepId = generateId();
        dispatch(
          actions.addStep({
            id: stepId,
            key: input.key,
            name: input.name,
            blockType: input.blockType,
            config: input.config,
          }),
        );
        dispatch(
          actions.addEdge({
            id: generateId(),
            from: fromId,
            to: stepId,
            port,
          }),
        );
      },
    }),
    [dispatch, state],
  );

  return { model, callbacks };
}
