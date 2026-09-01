import {
  evaluateCondition,
  resolveExpressions,
  type ExpressionScope,
} from "./expressions.js";
import type {
  BlockExecutor,
  StepExecutionRecord,
  WorkflowDefinition,
  WorkflowRunResult,
  WorkflowStepDef,
} from "./types.js";

export interface RunWorkflowOptions {
  definition: WorkflowDefinition;
  executor: BlockExecutor;
  // Exposed to expressions as {{trigger.payload...}}.
  triggerPayload?: unknown;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

// Sequential v1 of the RunCoordinator (doc 08 §7.3): walks the steps+edges
// graph, resolving each step's config against prior outputs before executing.
export async function runWorkflow(
  options: RunWorkflowOptions,
): Promise<WorkflowRunResult> {
  const { definition, executor } = options;
  const scope: ExpressionScope = {
    trigger: { payload: options.triggerPayload },
    steps: {},
    variables: Object.fromEntries(
      (definition.variables ?? []).map((v) => [v.key, v.value ?? null]),
    ),
  };

  const records = new Map<string, StepExecutionRecord>();
  // edgeId -> taken; an edge is decided once its source ran or was skipped.
  const edgeDecisions = new Map<string, boolean>();
  let runFailed: string | undefined;

  const decideOutgoing = (sourceId: string, port: string | undefined) => {
    for (const edge of definition.edges) {
      if (edge.from !== sourceId) continue;
      const portMatches = port !== undefined && edge.port === port;
      const taken =
        portMatches &&
        (!edge.condition || evaluateCondition(edge.condition, scope));
      edgeDecisions.set(edge.id, taken);
    }
  };

  // Trigger edges fire on the trigger's implicit "next" port.
  if (definition.trigger) {
    decideOutgoing(definition.trigger.id, "next");
  }

  const inboundEdges = (step: WorkflowStepDef) =>
    definition.edges.filter((edge) => edge.to === step.id);

  const isEntryStep = (step: WorkflowStepDef) =>
    !definition.trigger && inboundEdges(step).length === 0;

  const skipStep = (step: WorkflowStepDef) => {
    records.set(step.id, {
      stepId: step.id,
      key: step.key,
      blockType: step.blockType,
      status: "SKIPPED",
    });
    decideOutgoing(step.id, undefined);
  };

  const executeStep = async (step: WorkflowStepDef) => {
    const input = resolveExpressions(step.config, scope);
    try {
      const result = await executor.execute({
        blockType: step.blockType,
        config: input,
        connectionId: step.connectionId,
        step,
      });
      const port = result.port ?? "next";
      records.set(step.id, {
        stepId: step.id,
        key: step.key,
        blockType: step.blockType,
        status: "SUCCEEDED",
        input,
        output: result.output,
        port,
      });
      scope.steps[step.key] = { output: result.output };
      decideOutgoing(step.id, port);
    } catch (error) {
      records.set(step.id, {
        stepId: step.id,
        key: step.key,
        blockType: step.blockType,
        status: "FAILED",
        input,
        error: errorMessage(error),
      });
      decideOutgoing(step.id, "error");
      const errorHandled = definition.edges.some(
        (edge) => edge.from === step.id && edgeDecisions.get(edge.id),
      );
      if (!errorHandled) {
        runFailed = `Step "${step.key}" failed: ${errorMessage(error)}`;
      }
    }
  };

  let progressed = true;
  while (progressed && !runFailed) {
    progressed = false;
    for (const step of definition.steps) {
      if (records.has(step.id)) continue;
      const inbound = inboundEdges(step);
      if (isEntryStep(step)) {
        await executeStep(step);
        progressed = true;
        continue;
      }
      if (inbound.length === 0) continue;
      const decided = inbound.every((edge) => edgeDecisions.has(edge.id));
      if (!decided) continue;
      const reachable = inbound.some((edge) => edgeDecisions.get(edge.id));
      if (reachable) {
        await executeStep(step);
      } else {
        skipStep(step);
      }
      progressed = true;
      if (runFailed) break;
    }
  }

  // Steps never reached (dangling, cyclic, or after a terminal failure).
  for (const step of definition.steps) {
    if (!records.has(step.id)) skipStep(step);
  }

  // A FAILED record with a taken error edge is a handled failure; only
  // unhandled ones set runFailed above.
  const steps = definition.steps.map((step) => records.get(step.id)!);
  return runFailed
    ? { status: "FAILED", steps, error: runFailed }
    : { status: "SUCCEEDED", steps };
}
