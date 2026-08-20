import type { ChannelErrorSource, SyncOperationErrorType } from "./types.js";

export type GraphQLRequestErrorCategory =
  | "network"
  | "http"
  | "parse"
  | "graphql"
  | "missing-data";

export class GraphQLRequestError extends Error {
  readonly statusCode: number | undefined;
  readonly category: GraphQLRequestErrorCategory;
  /**
   * One entry per error the response carried, in order, holding its
   * `extensions.code` - undefined where it declared none. Kept per error rather
   * than as a set, because a response that mixes a classified error with an
   * unclassified one must not be read as if only the classified one arrived.
   */
  readonly codes: readonly (string | undefined)[];

  constructor(
    message: string,
    category: GraphQLRequestErrorCategory,
    statusCode?: number,
    codes: readonly (string | undefined)[] = [],
  ) {
    super(message);
    this.name = "GraphQLRequestError";
    this.category = category;
    this.statusCode = statusCode;
    this.codes = codes;
  }
}

/**
 * Extension codes a remote uses to say a failure is worth polling through.
 *
 * Shared with reactor-api so the server throws what this check reads and the two
 * cannot drift. A `graphql` category error is otherwise permanent: it stops the
 * poll timer, and nothing restarts it, so a code that lands here is the
 * difference between a channel that recovers and one that is dead for the
 * process lifetime.
 */
export const RECOVERABLE_GRAPHQL_ERROR_CODES = {
  /**
   * A stored operation cannot be represented in the schema - an action with no
   * id, say. The document holding it needs repairing, but the channel serves
   * every other document, and a peer that stopped polling would stop receiving
   * those too.
   */
  malformedStoredOperation: "MALFORMED_STORED_OPERATION",
} as const;

const RECOVERABLE_CODES: ReadonlySet<string> = new Set(
  Object.values(RECOVERABLE_GRAPHQL_ERROR_CODES),
);

/**
 * True when every error the response carried named a recoverable code.
 *
 * Unanimity is the requirement: one unclassified error alongside a recoverable
 * one means something else also went wrong, and polling through that would be
 * guessing.
 */
export function isRecoverableGraphQLError(error: GraphQLRequestError): boolean {
  return (
    error.codes.length > 0 &&
    error.codes.every(
      (code) => code !== undefined && RECOVERABLE_CODES.has(code),
    )
  );
}

/** Auth-rejection message fragments the switchboard emits. Shared with
 * reactor-api so server throws and this client check can't drift. */
export const DRIVE_AUTH_ERROR_MESSAGES = {
  forbidden: "Forbidden: insufficient permissions",
  authenticationRequired: "Forbidden: authentication required",
} as const;

/** True when the remote rejected the caller as unauthenticated/unauthorized:
 * an HTTP 401/403, or a Forbidden/Unauthorized GraphQL error. */
export function isDriveAuthError(error: unknown): boolean {
  if (!(error instanceof GraphQLRequestError)) {
    return false;
  }
  if (error.category === "http") {
    return error.statusCode === 401 || error.statusCode === 403;
  }
  if (error.category === "graphql") {
    return Object.values(DRIVE_AUTH_ERROR_MESSAGES).some((m) =>
      error.message.includes(m),
    );
  }
  return false;
}

export class PollingChannelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PollingChannelError";
  }
}

export class ChannelError extends Error {
  source: ChannelErrorSource;
  error: Error;
  /**
   * The classification when something other than the error carries it. Absent
   * means derive it from `error.name`; a dead letter mirrored from a peer sets it,
   * because only the message crosses the wire.
   */
  readonly errorType?: SyncOperationErrorType;

  constructor(
    source: ChannelErrorSource,
    error: Error,
    errorType?: SyncOperationErrorType,
  ) {
    super(`ChannelError[${source}]: ${error.message}`);
    this.name = "ChannelError";
    this.source = source;
    this.error = error;
    this.errorType = errorType;
  }
}
