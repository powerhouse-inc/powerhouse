// Names of the errors `ctx.reactor` throws. Errors cross the worker boundary by
// `name` and `message`, so compare `error.name` against these.
import type { JobInfo } from "@powerhousedao/reactor";
import type { Action } from "@powerhousedao/shared/document-model";

// A write's job was still running at the step deadline.
export const ReactorJobPendingError = "ReactorJobPendingError";
// A write's job failed, e.g. on a reducer error.
export const ReactorJobFailedError = "ReactorJobFailedError";
// A job finished but some of its actions failed.
export const ReactorActionsFailedError = "ReactorActionsFailedError";
// The declaration, the connection or the reactor's document auth refused the call.
export const ReactorAccessDeniedError = "ReactorAccessDeniedError";
// A `ctx.reactor`, or a page's `next`, was used after its request settled.
export const ReactorRequestClosedError = "ReactorRequestClosedError";
// The worker has no model for the document type.
export const DocumentModelUnavailableError = "DocumentModelUnavailableError";

export type ReactorErrorName =
  | typeof ReactorJobPendingError
  | typeof ReactorJobFailedError
  | typeof ReactorActionsFailedError
  | typeof ReactorAccessDeniedError
  | typeof ReactorRequestClosedError
  | typeof DocumentModelUnavailableError;

// A gate denial's message ends with the denied actions' indexes, e.g.
// `...; denied action indexes: [0,2]`; `deniedActionIndexes` reads them back.
export const DENIED_ACTION_INDEXES = "denied action indexes: ";

export function deniedActionIndexes(error: unknown): number[] | undefined {
  const { name, message } = (error ?? {}) as {
    name?: unknown;
    message?: unknown;
  };
  if (name !== ReactorAccessDeniedError || typeof message !== "string") {
    return undefined;
  }
  const at = message.lastIndexOf(DENIED_ACTION_INDEXES);
  if (at < 0) return undefined;
  const match = /^\[(\d+(?:,\d+)*)\]$/.exec(
    message.slice(at + DENIED_ACTION_INDEXES.length),
  );
  return match ? match[1].split(",").map(Number) : undefined;
}

// A reducer error or a denial does not fail the job, so each action is checked:
// each of `actions`, or without them (a create's own) each outcome by id.
export function assertActionsApplied(
  job: Pick<JobInfo, "result">,
  actions?: readonly Pick<Action, "id" | "type">[],
): void {
  const outcomes = job.result?.actions ?? [];
  const byId = new Map(outcomes.map((outcome) => [outcome.actionId, outcome]));
  const expected =
    actions?.map((action) => ({ id: action.id, label: action.type })) ??
    outcomes.map(({ actionId }) => ({ id: actionId, label: actionId }));
  const failed = expected.flatMap(({ id, label }) => {
    const outcome = byId.get(id);
    if (!outcome) return [`Action ${label} produced no operation`];
    if (outcome.kind === "reducer-error") {
      return [`Action ${label} failed: ${outcome.message}`];
    }
    if (outcome.kind === "denied") {
      return [`Action ${label} was denied: ${outcome.reason}`];
    }
    return [];
  });
  if (failed.length > 0) {
    const error = new Error(failed.join("; "));
    error.name = ReactorActionsFailedError;
    throw error;
  }
}
