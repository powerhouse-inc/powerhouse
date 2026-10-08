// The only file coupling the editor UI to the Powerhouse document: maps the
// workflow document state to the plain view model and callbacks to actions.
import { generateId } from "document-model";
import {
  actions,
  useSelectedWorkflowDocument,
  type PropertySetting,
  type StepTestRecord,
  type WorkflowState,
} from "document-models/workflow";
import { useMemo, useRef } from "react";
import { groupedAction, newUndoGroup } from "../../shared/undo-plan.js";
import { planFollowUp, type AddedBlock } from "../ui/add-follow-up.js";
import { stepBlock, triggerBlock, type BlockRef } from "../ui/blocks.js";
import {
  uniqueStepKey,
  type BlockStateModel,
  type PropertySettingModel,
  type WorkflowEditorCallbacks,
  type WorkflowModel,
} from "../ui/model.js";

// How long a follow-up waits for the add it completes to reach the state.
const FOLLOW_UP_ATTEMPTS = 20;
const FOLLOW_UP_WAIT_MS = 50;

// Older documents lack these fields entirely, hence the optional reads.
function blockState(block: {
  propertySettings?: PropertySetting[] | null;
  lastTest?: StepTestRecord | null;
  updatedAt?: string | null;
}): BlockStateModel {
  return {
    propertySettings: block.propertySettings?.map((setting) => ({
      prop: setting.prop,
      mode: setting.mode,
      schema: setting.schema ?? null,
    })),
    lastTest: block.lastTest
      ? { runId: block.lastTest.runId, testedAt: block.lastTest.testedAt }
      : null,
    updatedAt: block.updatedAt ?? null,
  };
}

function settingsInput(settings: PropertySettingModel[]) {
  return settings.map((setting) => ({
    prop: setting.prop,
    mode: setting.mode,
    schema: setting.schema ?? null,
  }));
}

function toModel(state: WorkflowState): WorkflowModel {
  return {
    name: state.name,
    description: state.description ?? null,
    status: state.status,
    version: state.version,
    published: state.published
      ? {
          version: state.published.version,
          publishedAt: state.published.publishedAt,
          blocks: [
            ...(state.published.trigger
              ? [
                  {
                    id: state.published.trigger.id,
                    label: "Trigger",
                    pieceName: state.published.trigger.pieceName,
                    pieceVersion: state.published.trigger.pieceVersion,
                    kind: "trigger" as const,
                    name: state.published.trigger.triggerName,
                    reactorConnectionId:
                      state.published.trigger.reactorConnectionId ?? null,
                  },
                ]
              : []),
            ...state.published.steps.map((step) => ({
              id: step.id,
              label: step.name || step.key,
              pieceName: step.pieceName,
              pieceVersion: step.pieceVersion,
              kind: "action" as const,
              name: step.actionName,
              reactorConnectionId: step.reactorConnectionId ?? null,
            })),
          ],
        }
      : null,
    readOnly: false,
    trigger: state.trigger
      ? {
          id: state.trigger.id,
          pieceName: state.trigger.pieceName,
          pieceVersion: state.trigger.pieceVersion,
          triggerName: state.trigger.triggerName,
          config: state.trigger.config,
          connectionId: state.trigger.connectionId ?? null,
          reactorConnectionId: state.trigger.reactorConnectionId ?? null,
          ...blockState(state.trigger),
        }
      : null,
    steps: state.steps.map((step) => ({
      id: step.id,
      key: step.key,
      name: step.name,
      pieceName: step.pieceName,
      pieceVersion: step.pieceVersion,
      actionName: step.actionName,
      connectionId: step.connectionId ?? null,
      reactorConnectionId: step.reactorConnectionId ?? null,
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
      skip: step.skip === true,
      ...blockState(step),
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
      type: variable.type ?? null,
    })),
  };
}

export function useWorkflowModel(): {
  model: WorkflowModel;
  callbacks: WorkflowEditorCallbacks;
} {
  const [document, dispatch] = useSelectedWorkflowDocument();
  const state = document.state.global;
  // Follow-ups land after the add; they read the state as it is by then.
  const latest = useRef(state);
  latest.current = state;

  const model = useMemo(() => toModel(state), [state]);

  const callbacks = useMemo<WorkflowEditorCallbacks>(
    () => ({
      setName: (name) => {
        dispatch(actions.setWorkflowName({ name }));
        // Base action keeps the document header name in sync for drive views.
        dispatch(actions.setName(name));
      },
      setDescription: (description) =>
        dispatch(actions.setWorkflowDescription({ description })),
      setStatus: (status) => dispatch(actions.setWorkflowStatus({ status })),
      setTrigger: (input) => {
        // Keep the trigger id stable so edges from it survive edits.
        const id = state.trigger?.id ?? generateId();
        const group = newUndoGroup();
        dispatch(
          groupedAction(
            actions.setTrigger({
              id,
              pieceName: input.pieceName,
              pieceVersion: input.pieceVersion,
              triggerName: input.triggerName,
              config: input.config,
              connectionId: input.connectionId,
              reactorConnectionId: input.reactorConnectionId,
              ...(input.propertySettings
                ? { propertySettings: settingsInput(input.propertySettings) }
                : {}),
            }),
            group,
          ),
        );
        return { id, group, block: triggerBlock(input) };
      },
      clearTrigger: () => dispatch(actions.clearTrigger({})),
      addStep: (input) => {
        const id = generateId();
        const group = newUndoGroup();
        dispatch(
          groupedAction(
            actions.addStep({
              id,
              key: input.key,
              name: input.name,
              pieceName: input.pieceName,
              pieceVersion: input.pieceVersion,
              actionName: input.actionName,
              config: input.config,
              position: input.position,
            }),
            group,
          ),
        );
        return { id, group, block: stepBlock(input) };
      },
      updateStep: (input) => dispatch(actions.updateStep(input)),
      setStepConfig: (id, config, extras) =>
        dispatch(
          actions.setStepConfig({
            id,
            config,
            ...(extras?.propertySettings
              ? { propertySettings: settingsInput(extras.propertySettings) }
              : {}),
          }),
        ),
      publish: () =>
        new Promise<void>((resolve, reject) => {
          const publish = actions.publishWorkflow({
            publishedAt: new Date().toISOString(),
          });
          // Activepieces turns a flow on when it is published.
          const batch =
            state.status === "ENABLED"
              ? [publish]
              : [
                  publish,
                  actions.setWorkflowStatus({ status: "ENABLED" as const }),
                ];
          dispatch(
            batch,
            (errors) => reject(errors[0]),
            () => resolve(),
          );
        }),
      discardChanges: () => dispatch(actions.revertToPublished({})),
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
      moveStep: (move) => {
        // Re-parent only: the step keeps its own outgoing edges, and the port
        // it used to hang off simply becomes free again.
        for (const edge of state.edges.filter(
          (entry) => entry.to === move.stepId,
        )) {
          dispatch(actions.removeEdge({ id: edge.id }));
        }
        dispatch(
          actions.addEdge({
            id: generateId(),
            from: move.toParentId,
            to: move.stepId,
            port: move.port,
          }),
        );
      },
      setVariable: (input) =>
        dispatch(
          actions.setVariable({
            id: input.id ?? generateId(),
            key: input.key,
            value: input.value,
            description: input.description,
            ...(input.type !== undefined ? { type: input.type } : {}),
          }),
        ),
      removeVariable: (id) => dispatch(actions.removeVariable({ id })),
      insertStepOnEdge: (edgeId, input, port) => {
        const edge = state.edges.find((entry) => entry.id === edgeId);
        if (!edge) return undefined;
        const stepId = generateId();
        const continuing = generateId();
        const group = newUndoGroup();
        dispatch(
          [
            actions.addStep({
              id: stepId,
              key: input.key,
              name: input.name,
              pieceName: input.pieceName,
              pieceVersion: input.pieceVersion,
              actionName: input.actionName,
              config: input.config,
            }),
            actions.removeEdge({ id: edgeId }),
            actions.addEdge({
              id: generateId(),
              from: edge.from,
              to: stepId,
              port: edge.port,
              condition: edge.condition,
            }),
            actions.addEdge({
              id: continuing,
              from: stepId,
              to: edge.to,
              port,
            }),
          ].map((action) => groupedAction(action, group)),
        );
        return {
          id: stepId,
          group,
          block: stepBlock(input),
          continuation: { edgeId: continuing, port },
        };
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
            pieceName: step.pieceName,
            pieceVersion: step.pieceVersion,
            actionName: step.actionName,
            connectionId: step.connectionId,
            reactorConnectionId: step.reactorConnectionId,
            config: step.config,
            retry: step.retry,
            timeoutSeconds: step.timeoutSeconds,
            idempotencyKeyExpression: step.idempotencyKeyExpression,
            position: step.position,
            propertySettings: step.propertySettings,
          }),
        );
      },
      appendStep: (fromId, port, input) => {
        const stepId = generateId();
        const group = newUndoGroup();
        dispatch(
          [
            actions.addStep({
              id: stepId,
              key: input.key,
              name: input.name,
              pieceName: input.pieceName,
              pieceVersion: input.pieceVersion,
              actionName: input.actionName,
              config: input.config,
            }),
            actions.addEdge({
              id: generateId(),
              from: fromId,
              to: stepId,
              port,
            }),
          ].map((action) => groupedAction(action, group)),
        );
        return { id: stepId, group, block: stepBlock(input) };
      },
      completeBlock: (added, form) => {
        let attempts = 0;
        const attempt = () => {
          const current = latest.current;
          const found = findBlock(current, added);
          // Not in the state yet: the add may still be on its way.
          if (!found && attempts++ < FOLLOW_UP_ATTEMPTS) {
            setTimeout(attempt, FOLLOW_UP_WAIT_MS);
            return;
          }
          const plan = planFollowUp(added, found, current.edges, form);
          if (!plan) return;
          const trigger = current.trigger;
          const followUps = [
            ...(plan.config && trigger?.id === added.id
              ? [
                  actions.setTrigger({
                    id: trigger.id,
                    pieceName: trigger.pieceName,
                    pieceVersion: trigger.pieceVersion,
                    triggerName: trigger.triggerName,
                    config: plan.config,
                    connectionId: trigger.connectionId,
                    reactorConnectionId: trigger.reactorConnectionId,
                  }),
                ]
              : plan.config
                ? [actions.setStepConfig({ id: added.id, config: plan.config })]
                : []),
            ...(plan.repoint
              ? [
                  actions.removeEdge({ id: plan.repoint.edge.id }),
                  actions.addEdge({
                    id: generateId(),
                    from: plan.repoint.edge.from,
                    to: plan.repoint.edge.to,
                    port: plan.repoint.port,
                    condition: plan.repoint.edge.condition,
                  }),
                ]
              : []),
          ];
          dispatch(
            followUps.map((action) => groupedAction(action, added.group)),
          );
        };
        attempt();
      },
    }),
    [dispatch, state],
  );

  return { model, callbacks };
}

// The added block as the state holds it now, or undefined when it is gone.
function findBlock(
  state: WorkflowState,
  added: AddedBlock,
): { block: BlockRef; config: unknown } | undefined {
  if (state.trigger?.id === added.id) {
    return { block: triggerBlock(state.trigger), config: state.trigger.config };
  }
  const step = state.steps.find((entry) => entry.id === added.id);
  return step ? { block: stepBlock(step), config: step.config } : undefined;
}
