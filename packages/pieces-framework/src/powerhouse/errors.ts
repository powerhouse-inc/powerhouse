// Names of the errors `ctx.reactor` throws. Errors cross the worker boundary by
// `name` and `message`, so compare `error.name` against these.

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
