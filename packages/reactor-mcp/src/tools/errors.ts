export const REACTOR_TOOL_ERROR_CODES = [
  "NOT_FOUND",
  "FORBIDDEN",
  "INVALID_ACTION",
  "REDUCER_ERROR",
  "CONFLICT",
] as const;

export type ReactorToolErrorCode = (typeof REACTOR_TOOL_ERROR_CODES)[number];

/** One rejected action: its position in the batch and why. */
export type ActionFailure = {
  index: number;
  type: string;
  code: Extract<
    ReactorToolErrorCode,
    "INVALID_ACTION" | "FORBIDDEN" | "REDUCER_ERROR"
  >;
  errors: string[];
};

export class ReactorToolError extends Error {
  readonly code: ReactorToolErrorCode;
  readonly failures?: ActionFailure[];

  constructor(
    code: ReactorToolErrorCode,
    message: string,
    options: { failures?: ActionFailure[]; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "ReactorToolError";
    this.code = code;
    if (options.failures) this.failures = options.failures;
  }

  toJSON(): {
    code: ReactorToolErrorCode;
    message: string;
    failures?: ActionFailure[];
  } {
    return {
      code: this.code,
      message: this.message,
      ...(this.failures ? { failures: this.failures } : {}),
    };
  }
}

export function isReactorToolError(error: unknown): error is ReactorToolError {
  return (
    error instanceof ReactorToolError ||
    (error instanceof Error &&
      error.name === "ReactorToolError" &&
      REACTOR_TOOL_ERROR_CODES.includes(
        (error as { code?: unknown }).code as ReactorToolErrorCode,
      ))
  );
}

// Reactor and piece-host errors are matched by name: they cross worker
// boundaries, and `./tools` must not import the reactor at runtime.
const NAME_CODES: Partial<Record<string, ReactorToolErrorCode>> = {
  DocumentNotFoundError: "NOT_FOUND",
  DocumentPurgedError: "NOT_FOUND",
  DocumentDeletedError: "NOT_FOUND",
  RelationshipNotFoundError: "NOT_FOUND",
  DocumentModelUnavailableError: "NOT_FOUND",
  UnsupportedDocumentModelVersionError: "NOT_FOUND",
  AuthorizationDeniedError: "FORBIDDEN",
  ReactorAccessDeniedError: "FORBIDDEN",
  ReservedActionError: "FORBIDDEN",
  InvalidSignatureError: "FORBIDDEN",
  InvalidActionInputError: "INVALID_ACTION",
  InvalidActionInputZodError: "INVALID_ACTION",
  ReactorActionsFailedError: "REDUCER_ERROR",
  ExcessiveReshuffleError: "CONFLICT",
  AuthTimestampNotMonotonicError: "CONFLICT",
  UpgradePreconditionFailedError: "CONFLICT",
  InvalidOperationTimestampError: "CONFLICT",
};

function codeFromMessage(message: string): ReactorToolErrorCode | undefined {
  if (/\bnot found\b|does not exist|no such/i.test(message)) return "NOT_FOUND";
  if (/\b(denied|forbidden|not allowed|unauthori[sz]ed)\b/i.test(message)) {
    return "FORBIDDEN";
  }
  if (/\bconflict/i.test(message)) return "CONFLICT";
  return undefined;
}

/** Normalizes any thrown value to a {@link ReactorToolError}. */
export function toReactorToolError(
  error: unknown,
  fallback: ReactorToolErrorCode = "REDUCER_ERROR",
): ReactorToolError {
  if (error instanceof ReactorToolError) return error;
  // One from another realm or bundle copy, rebuilt so it has `toJSON`.
  if (isReactorToolError(error)) {
    const { failures } = error as { failures?: ActionFailure[] };
    return new ReactorToolError(error.code, error.message, {
      failures,
      cause: error,
    });
  }
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : ((JSON.stringify(error) as string | undefined) ?? "Unknown error");
  const name = error instanceof Error ? error.name : "";
  // A failed job carries the reactor error that failed it.
  const jobErrorName = (
    error as { job?: { error?: { name?: unknown } } } | null
  )?.job?.error?.name;
  const code =
    NAME_CODES[name] ??
    (typeof jobErrorName === "string" ? NAME_CODES[jobErrorName] : undefined) ??
    codeFromMessage(message) ??
    fallback;
  return new ReactorToolError(code, message, { cause: error });
}

export function notFound(message: string): ReactorToolError {
  return new ReactorToolError("NOT_FOUND", message);
}
