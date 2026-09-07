// The only file coupling the editor UI to the Powerhouse document: maps the
// workflow document state to the plain view model and callbacks to actions.
import { generateId } from "document-model";
import {
  actions,
  useSelectedWorkflowDocument,
  type WorkflowState,
} from "document-models/workflow";
import { useMemo } from "react";
import {
  uniqueStepKey,
  type WorkflowEditorCallbacks,
  type WorkflowModel,
} from "../ui/model.js";

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
      retry: step.retry
        ? {
            maxAttempts: step.retry.maxAttempts,
            backoff: step.retry.backoff,
            initialDelaySeconds: step.retry.initialDelaySeconds,
            maxDelaySeconds: step.retry.maxDelaySeconds,
            retryOn: [...step.retry.retryOn],
          }
        : null,
      timeoutSeconds: step.timeoutSeconds ?? null,
      idempotencyKeyExpression: step.idempotencyKeyExpression ?? null,
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
    variables: state.variables.map((variable) => ({
      id: variable.id,
      key: variable.key,
      value: variable.value ?? null,
      description: variable.description ?? null,
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
      setName: (name) => {
        dispatch(actions.setWorkflowName({ name }));
        // Base action keeps the document header name in sync for drive views.
        dispatch(actions.setName(name));
      },
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
      setVariable: (input) =>
        dispatch(
          actions.setVariable({
            id: input.id ?? generateId(),
            key: input.key,
            value: input.value,
            description: input.description,
          }),
        ),
      removeVariable: (id) => dispatch(actions.removeVariable({ id })),
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
      duplicateStep: (id) => {
        const step = state.steps.find((entry) => entry.id === id);
        if (!step) return;
        dispatch(
          actions.addStep({
            id: generateId(),
            key: uniqueStepKey(
              state.steps.map((entry) => entry.key),
              step.key,
            ),
            name: step.name,
            blockType: step.blockType,
            connectionId: step.connectionId,
            config: step.config,
            retry: step.retry,
            timeoutSeconds: step.timeoutSeconds,
            idempotencyKeyExpression: step.idempotencyKeyExpression,
            position: step.position,
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
