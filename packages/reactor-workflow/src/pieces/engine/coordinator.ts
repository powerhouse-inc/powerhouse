import {
  containsRedactedMarker,
  redact,
  redactMessage,
  secretsFor,
} from "../activepieces/worker/redact.js";
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
  // Journaled outputs from a prior run, keyed by step id; matching steps
  // replay (output injected, port re-taken) instead of executing.
  completedSteps?: Map<string, { output?: unknown; port?: string | null }>;
  // Called as each step reaches a terminal state, so a run that dies
  // mid-flight leaves the steps it finished behind. Ordinal is execution
  // order; skips are excluded, being knowable only once the run completes.
  onStep?: (
    record: StepExecutionRecord,
    ordinal: number,
  ) => void | Promise<void>;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

// A record is journal material, read back by the editor and kept in the
// database, so it never carries the live value a downstream step reads.
function journaled(value: unknown, values: string[] | undefined): unknown {
  return value === undefined ? undefined : redact(value, { values });
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
  let executedCount = 0;

  // A failing journal write must not cost us the step's completed work: the
  // run carries on, and finishRun's final sweep repairs the missing row.
  const journal = async (record: StepExecutionRecord) => {
    if (!options.onStep) return;
    const ordinal = executedCount++;
    try {
      await options.onStep(record, ordinal);
    } catch {
      // Durability is the bonus here; run correctness is not at stake.
    }
  };

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

  // The journal keeps a redacted copy, so a replay would hand the marker to
  // the next step. Refusing is loud; replaying it would be silently wrong.
  const refuseReplay = (step: WorkflowStepDef) => {
    const error =
      `Journaled output of step "${step.key}" was redacted and cannot be ` +
      "replayed; fire the workflow again instead of rerunning it";
    records.set(step.id, {
      stepId: step.id,
      key: step.key,
      blockType: step.blockType,
      status: "FAILED",
      error,
    });
    runFailed = error;
  };

  const executeStep = async (step: WorkflowStepDef) => {
    const replay = options.completedSteps?.get(step.id);
    if (replay) {
      if (containsRedactedMarker(replay.output)) {
        refuseReplay(step);
        return;
      }
      const port = replay.port ?? "next";
      const record: StepExecutionRecord = {
        stepId: step.id,
        key: step.key,
        blockType: step.blockType,
        status: "REPLAYED",
        output: replay.output,
        port,
      };
      records.set(step.id, record);
      await journal(record);
      scope.steps[step.key] = { output: replay.output };
      decideOutgoing(step.id, port);
      return;
    }
    const input = resolveExpressions(step.config, scope);
    try {
      const result = await executor.execute({
        blockType: step.blockType,
        config: input,
        connectionId: step.connectionId,
        step,
      });
      const port = result.port ?? "next";
      const record: StepExecutionRecord = {
        stepId: step.id,
        key: step.key,
        blockType: step.blockType,
        status: "SUCCEEDED",
        input: journaled(input, result.redactValues),
        output: journaled(result.output, result.redactValues),
        port,
      };
      records.set(step.id, record);
      await journal(record);
      scope.steps[step.key] = { output: result.output };
      decideOutgoing(step.id, port);
    } catch (error) {
      // A failed step is exactly where an input gets inspected, so it is
      // redacted with the same secrets the successful path uses.
      const values = secretsFor(error);
      const detail = redactMessage(errorMessage(error), { values });
      const record: StepExecutionRecord = {
        stepId: step.id,
        key: step.key,
        blockType: step.blockType,
        status: "FAILED",
        input: journaled(input, values),
        error: detail,
      };
      records.set(step.id, record);
      await journal(record);
      // The same redacted text the journal took: an error-port branch writing
      // the reason somewhere a person will read must not widen what a failure
      // discloses.
      scope.steps[step.key] = { error: detail };
      decideOutgoing(step.id, "error");
      const errorHandled = definition.edges.some(
        (edge) => edge.from === step.id && edgeDecisions.get(edge.id),
      );
      if (!errorHandled) {
        runFailed = `Step "${step.key}" failed: ${detail}`;
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
        // Independent roots are otherwise free to run their side effects
        // before the outer loop notices the run is already over.
        if (runFailed) break;
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
