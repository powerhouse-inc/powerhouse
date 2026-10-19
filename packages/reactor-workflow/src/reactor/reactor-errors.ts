// Reactor errors cross the worker boundary by name; pieces test those names.
import {
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
    readonly name: ReactorErrorName,
    message: string,
  ) {
    super(message);
  }
}

export function accessDenied(message: string): ReactorError {
  return new ReactorError(ReactorAccessDeniedError, message);
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
