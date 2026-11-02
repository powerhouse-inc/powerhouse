// Reactor errors cross the worker boundary by name; pieces test those names.
import {
  DENIED_ACTION_INDEXES,
  ReactorAccessDeniedError,
  type ReactorErrorName,
} from "@powerhousedao/pieces-framework";

export {
  DocumentModelUnavailableError,
  ReactorAccessDeniedError,
  ReactorActionsFailedError,
  ReactorJobFailedError,
  ReactorJobPendingError,
  ReactorRequestClosedError,
  type ReactorErrorName,
} from "@powerhousedao/pieces-framework";

export class ReactorError extends Error {
  constructor(
    override readonly name: ReactorErrorName,
    message: string,
  ) {
    super(message);
  }
}

export function accessDenied(message: string): ReactorError {
  return new ReactorError(ReactorAccessDeniedError, message);
}

export type DeniedAction = { index: number; type: string; reason: string };

// The gate's denial. Only name and message cross the worker boundary, so the
// message ends with the indexes `deniedActionIndexes` reads.
export class ReactorActionsDeniedError extends ReactorError {
  constructor(
    documentId: string,
    readonly denied: DeniedAction[],
  ) {
    super(ReactorAccessDeniedError, deniedMessage(documentId, denied));
  }
}

function deniedMessage(documentId: string, denied: DeniedAction[]): string {
  const actions = denied.map(({ type, reason }) => `${type} (${reason})`);
  const indexes = denied.map(({ index }) => index).join(",");
  return `The run user may not apply ${actions.join(", ")} to document ${documentId}; ${DENIED_ACTION_INDEXES}[${indexes}]`;
}

// A client method no piece is offered.
export function refusedMethod(method: string): ReactorError {
  return accessDenied(`${method} is not available to workflow pieces`);
}

export function isReactorError(
  error: unknown,
  name: ReactorErrorName,
): error is ReactorError {
  return error instanceof Error && error.name === name;
}
