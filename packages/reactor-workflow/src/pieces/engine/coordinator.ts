import {
  containsRedactedMarker,
  redact,
  redactMessage,
  secretsFor,
} from "../activepieces/worker/redact.js";
import { PieceWorkerError } from "../activepieces/worker/host.js";
import {
  evaluateCondition,
  unavailableValue,
  UnavailableValueError,
  type ExpressionScope,
} from "./expressions.js";
import {
  effectiveRetryPolicy,
  isRetryableError,
  retryDelayMs,
  type EffectiveRetryPolicy,
} from "./retry.js";
import { resolveStepInput } from "./step-input.js";
import { checkDynamicProperties } from "./dynamic-props.js";
import { isIndeterminateError } from "../activepieces/indeterminate.js";
import {
  referenceDocuments,
  undeclaredPortEdges,
} from "@powerhousedao/pieces-framework/workflow";
import { stepConfigHash } from "./canonical.js";
import type { BlockRef } from "@powerhousedao/pieces-framework/block-type";
import { blockLabel, pieceRecord, resolutionOf } from "./resolution.js";
import {
  stepBlock,
  triggerBlock,
  type BlockExecutor,
  type StepExecutionRecord,
  type WorkflowDefinition,
  type WorkflowRunResult,
  type WorkflowStepDef,
} from "./types.js";

/** One step a prior run already completed, as a rerun replays it. */
export interface ReplayedStep {
  output?: unknown;
  port?: string | null;
  /**
   * The step SUCCEEDED, but the run journal truncated its output past the
   * payload cap, so there is nothing to replay.
   *
   * It still replays, rather than running again: the step had side effects and
   * re-running it would charge the card twice (backlog item 15). Its scope
   * entry carries an unavailable value instead of data, so a downstream step
   * that reads `steps.<key>.output…` fails the rerun by name.
   */
  outputTruncated?: boolean;
}

export interface RunWorkflowOptions {
  definition: WorkflowDefinition;
  executor: BlockExecutor;
  // Exposed to expressions as {{trigger.payload...}}.
  triggerPayload?: unknown;
  // Journaled outputs from a prior run, keyed by step id; matching steps
  // replay (output injected, port re-taken) instead of executing.
  completedSteps?: Map<string, ReplayedStep>;
  // The workflow policy's `defaultRetry`, for steps with no `retry` of their
  // own. Absent enforces no retry, which is what a definition with no policy
  // (every legacy document) means.
  defaultRetry?: EffectiveRetryPolicy | null;
  // Epoch ms the run must be over by (`policy.runTimeoutSeconds`). Checked
  // before each step and while a retry waits; past it the run is CANCELLED.
  deadline?: number;
  // Test seam for the retry waits, so a suite does not sleep through them.
  sleep?: (ms: number) => Promise<void>;
  // Called as each step reaches a terminal state, so a run that dies
  // mid-flight leaves the steps it finished behind. Ordinal is execution
  // order; skips are excluded, being knowable only once the run completes.
  onStep?: (
    record: StepExecutionRecord,
    ordinal: number,
  ) => void | Promise<void>;
  // Resolved secret variables: kept out of every journaled record and error.
  redactValues?: string[];
  // Scope entries of steps outside the definition; a single-step test reads
  // its upstream steps' test outputs from here.
  priorSteps?: ExpressionScope["steps"];
  // A block's declared output ports; an edge on any other is a warning.
  declaredPorts?: (block: BlockRef) => readonly string[] | undefined;
}

// Edges no run can take, because their source never emits that port.
export function deadPortWarnings(
  definition: WorkflowDefinition,
  declaredPorts: (block: BlockRef) => readonly string[] | undefined,
): string[] {
  const blocks = new Map<string, { key: string; block: BlockRef }>(
    definition.steps.map((step) => [
      step.id,
      { key: step.key, block: stepBlock(step) },
    ]),
  );
  if (definition.trigger) {
    blocks.set(definition.trigger.id, {
      key: "trigger",
      block: triggerBlock(definition.trigger),
    });
  }
  return undeclaredPortEdges(definition.edges, (id) => {
    const source = blocks.get(id);
    return source ? declaredPorts(source.block) : undefined;
  }).map((edge) => {
    const source = blocks.get(edge.from)!;
    const target = blocks.get(edge.to)?.key ?? edge.to;
    return `Edge from "${source.key}" to "${target}" leaves on port "${edge.port}", which ${blockLabel(source.block)} never takes`;
  });
}

function withPiece(
  piece: StepExecutionRecord["piece"],
): Pick<StepExecutionRecord, "piece"> {
  return piece ? { piece } : {};
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

// A piece's own error crosses the worker inside a PieceWorkerError.
export function errorNameOf(error: unknown): string | undefined {
  if (error instanceof PieceWorkerError) return error.serialized.name;
  return error instanceof Error ? error.name : undefined;
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
  const runSecrets = options.redactValues ?? [];
  const scope: ExpressionScope = {
    trigger: { payload: options.triggerPayload },
    steps: { ...options.priorSteps },
    variables: Object.fromEntries(
      (definition.variables ?? []).map((v) => [v.key, v.value ?? null]),
    ),
  };

  const records = new Map<string, StepExecutionRecord>();
  // edgeId -> taken; an edge is decided once its source ran or was skipped.
  const edgeDecisions = new Map<string, boolean>();
  let runFailed: string | undefined;
  // Set instead of runFailed when the run ran out of time: the workflow did
  // not fail, it was stopped, and the status says so.
  let runCancelled: string | undefined;
  let runFailedName: string | undefined;
  let executedCount = 0;
  const sleep =
    options.sleep ??
    ((ms: number) =>
      new Promise<void>((resolve) => {
        // A pending retry wait must not be what keeps the process alive.
        setTimeout(resolve, ms).unref();
      }));

  // Null while there is time left; the reason once there is not.
  const outOfTime = (): string | undefined => {
    if (options.deadline === undefined) return undefined;
    if (Date.now() < options.deadline) return undefined;
    return "Run exceeded its runTimeoutSeconds and was cancelled";
  };

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
      let taken = portMatches;
      if (taken && edge.condition) {
        try {
          taken = evaluateCondition(edge.condition, scope);
        } catch (error) {
          taken = false;
          runFailed ??= `Condition of edge "${edge.id}": ${errorMessage(error)}`;
        }
      }
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
      pieceName: step.pieceName,
      blockName: step.actionName,
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
      pieceName: step.pieceName,
      blockName: step.actionName,
      status: "FAILED",
      error,
    });
    runFailed = error;
  };

  // An author-skipped step continues on "next" as if it output nothing.
  const passStep = async (step: WorkflowStepDef) => {
    const record: StepExecutionRecord = {
      stepId: step.id,
      key: step.key,
      pieceName: step.pieceName,
      blockName: step.actionName,
      status: "SKIPPED",
      output: null,
      port: "next",
    };
    records.set(step.id, record);
    await journal(record);
    scope.steps[step.key] = { output: null };
    decideOutgoing(step.id, "next");
  };

  const executeStep = async (step: WorkflowStepDef) => {
    if (step.skip === true) {
      await passStep(step);
      return;
    }
    const replay = options.completedSteps?.get(step.id);
    if (replay) {
      if (containsRedactedMarker(replay.output)) {
        refuseReplay(step);
        return;
      }
      const port = replay.port ?? "next";
      // Truncated: the step is completed, its output is not available. Both
      // halves have to be true at once, or the rerun either re-runs a side
      // effect or hands a marker on as data.
      const output = replay.outputTruncated
        ? unavailableValue(
            `Output of step "${step.key}" is unavailable: it succeeded in the ` +
              "run being rerun, but the run journal truncated its output past " +
              "the payload cap. The step is not re-run, because it had side " +
              "effects. Fire the workflow again instead of rerunning it.",
          )
        : replay.output;
      const record: StepExecutionRecord = {
        stepId: step.id,
        key: step.key,
        pieceName: step.pieceName,
        blockName: step.actionName,
        status: "REPLAYED",
        // Journaled as the marker it was, not as the wrapper: the wrapper is a
        // run-scope device and carries its reason on a symbol.
        output: replay.outputTruncated ? undefined : replay.output,
        port,
        configHash: stepConfigHash(step),
      };
      records.set(step.id, record);
      await journal(record);
      scope.steps[step.key] = { output };
      decideOutgoing(step.id, port);
      return;
    }

    // One resolved policy per step: its own `retry`, else the workflow's. A
    // step that DECLARES a block overrides, whatever the block resolves to —
    // `{maxAttempts: 1}` is an author saying "not this one", and inheriting
    // the workflow default over it would be the opposite of an override.
    const retry =
      step.retry === undefined || step.retry === null
        ? (options.defaultRetry ?? null)
        : effectiveRetryPolicy(step.retry);
    const maxAttempts = retry?.maxAttempts ?? 1;
    const startedAt = new Date().toISOString();
    let input: unknown;

    for (let attempt = 1; ; attempt++) {
      const attempts = attempt > 1 ? { attempts: attempt } : {};
      try {
        input = resolveStepInput(step, scope);
        checkDynamicProperties(input, step.propertySettings);
        const result = await executor.execute({
          block: stepBlock(step),
          config: input,
          connectionId: step.connectionId,
          reactorConnectionId: step.reactorConnectionId,
          step,
          ...(runSecrets.length > 0 ? { redactValues: runSecrets } : {}),
        });
        const port = result.port ?? "next";
        const values = [...runSecrets, ...(result.redactValues ?? [])];
        const record: StepExecutionRecord = {
          stepId: step.id,
          key: step.key,
          pieceName: step.pieceName,
          blockName: step.actionName,
          status: "SUCCEEDED",
          input: journaled(input, values),
          // Documents go into the record as references; the scope keeps them whole.
          output: journaled(referenceDocuments(result.output), values),
          port,
          startedAt,
          endedAt: new Date().toISOString(),
          ...withPiece(pieceRecord(result.resolution)),
          configHash: stepConfigHash(step),
          ...attempts,
        };
        records.set(step.id, record);
        await journal(record);
        scope.steps[step.key] = { output: result.output };
        decideOutgoing(step.id, port);
        return;
      } catch (error) {
        // A failed step is exactly where an input gets inspected, so it is
        // redacted with the same secrets the successful path uses.
        const values = [...runSecrets, ...secretsFor(error)];
        const detail = redactMessage(errorMessage(error), { values });
        const errorName = errorNameOf(error);
        // A host call that timed out may have committed the write it asked
        // for, so neither the step's failure nor its success is knowable. It
        // is not retried either: a retry would be a second write.
        const indeterminate = isIndeterminateError(error);
        const expired = outOfTime();
        const retryable =
          retry !== null &&
          attempt < maxAttempts &&
          !indeterminate &&
          // A value that is gone stays gone, and an expression that names
          // nothing names nothing on the next attempt either.
          !(error instanceof UnavailableValueError) &&
          expired === undefined &&
          isRetryableError(retry, error);
        if (retryable) {
          const waitMs = retryDelayMs(retry, attempt + 1);
          if (waitMs > 0) await sleep(waitMs);
          // The wait may have taken the run past its deadline; the next
          // attempt's own check catches that and stops.
          continue;
        }
        const failedAfter = attempt > 1 ? ` after ${attempt} attempts` : "";
        const record: StepExecutionRecord = {
          stepId: step.id,
          key: step.key,
          pieceName: step.pieceName,
          blockName: step.actionName,
          status: indeterminate ? "INDETERMINATE" : "FAILED",
          input: journaled(input, values),
          error: detail,
          ...(errorName ? { errorName } : {}),
          startedAt,
          endedAt: new Date().toISOString(),
          ...withPiece(pieceRecord(resolutionOf(error))),
          configHash: stepConfigHash(step),
          ...attempts,
        };
        records.set(step.id, record);
        if (indeterminate) {
          await journal(record);
          // No port, so nothing downstream runs and no error branch claims to
          // have handled something that may have succeeded.
          runFailed = `Step "${step.key}" is INDETERMINATE: ${detail}`;
          runFailedName = errorName;
          return;
        }
        await journal(record);
        // The same redacted text the journal took: an error-port branch
        // writing the reason somewhere a person will read must not widen what
        // a failure discloses.
        scope.steps[step.key] = { error: detail };
        decideOutgoing(step.id, "error");
        const errorHandled = definition.edges.some(
          (edge) => edge.from === step.id && edgeDecisions.get(edge.id),
        );
        if (!errorHandled) {
          runFailed = `Step "${step.key}" failed${failedAfter}: ${detail}`;
          runFailedName = errorName;
        }
        return;
      }
    }
  };

  let progressed = true;
  while (progressed && !runFailed && !runCancelled) {
    progressed = false;
    for (const step of definition.steps) {
      if (records.has(step.id)) continue;
      // Before the step, never during it: a step is the unit of work and
      // killing one mid-flight would leave a side effect with no record.
      runCancelled = outOfTime();
      if (runCancelled) break;
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
  const warnings = options.declaredPorts
    ? deadPortWarnings(definition, options.declaredPorts)
    : [];
  const noted = warnings.length > 0 ? { warnings } : {};
  if (runFailed) {
    return {
      status: "FAILED",
      steps,
      error: runFailed,
      ...(runFailedName ? { errorName: runFailedName } : {}),
      ...noted,
    };
  }
  // The deadline is the last word: a run whose final step happened to finish
  // in time still reads CANCELLED if the loop stopped for the clock, and the
  // steps it did complete are journaled either way.
  if (runCancelled) {
    return { status: "CANCELLED", steps, error: runCancelled, ...noted };
  }
  return { status: "SUCCEEDED", steps, ...noted };
}
