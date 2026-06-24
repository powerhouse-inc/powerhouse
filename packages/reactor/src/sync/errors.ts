import type { ChannelErrorSource } from "./types.js";

export type GraphQLRequestErrorCategory =
  | "network"
  | "http"
  | "parse"
  | "graphql"
  | "missing-data";

export class GraphQLRequestError extends Error {
  readonly statusCode: number | undefined;
  readonly category: GraphQLRequestErrorCategory;

  constructor(
    message: string,
    category: GraphQLRequestErrorCategory,
    statusCode?: number,
  ) {
    super(message);
    this.name = "GraphQLRequestError";
    this.category = category;
    this.statusCode = statusCode;
  }
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

  constructor(source: ChannelErrorSource, error: Error) {
    super(`ChannelError[${source}]: ${error.message}`);
    this.name = "ChannelError";
    this.source = source;
    this.error = error;
  }
}
