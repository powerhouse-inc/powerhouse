import { GraphQLError } from "graphql";
import {
  DRIVE_AUTH_ERROR_MESSAGES,
  RECOVERABLE_GRAPHQL_ERROR_CODES,
} from "@powerhousedao/reactor";

/** Caller (authenticated or anonymous) lacks permission for the document. */
export class ForbiddenError extends GraphQLError {
  constructor(detail = "") {
    const base = DRIVE_AUTH_ERROR_MESSAGES.forbidden;
    super(`${base}${detail ? ` ${detail}` : ""}`, {
      extensions: { code: "FORBIDDEN" },
    });
  }
}

/** Anonymous caller on an action that requires logging in. */
export class AuthenticationRequiredError extends GraphQLError {
  constructor(detail = "") {
    const base = DRIVE_AUTH_ERROR_MESSAGES.authenticationRequired;
    super(`${base}${detail ? ` ${detail}` : ""}`, {
      extensions: { code: "UNAUTHENTICATED" },
    });
  }
}

/**
 * The reactor holds no decision model, so no authorization preflight can be
 * answered.
 *
 * Distinct from a denial, and deliberately so: a caller that cannot get a
 * prediction should render its controls as it did before it asked and let the
 * submit path refuse. Reading this as a denial would disable every control on a
 * switchboard running without authEnforcement. The code is what a client
 * branches on, since the message is not a contract.
 */
export class AuthEvaluationUnsupportedError extends GraphQLError {
  constructor() {
    super(
      "Authorization evaluation is unavailable: this reactor runs without the " +
        "authEnforcement feature flag, so it holds no decision model",
      { extensions: { code: "AUTH_EVALUATION_UNSUPPORTED" } },
    );
  }
}

/**
 * A stored operation cannot be represented in the schema, so it is reported
 * rather than served.
 *
 * The schema declares an action's id, type, timestamp, input and scope
 * non-null; an operation written before the API rejected an action without an
 * id violates that. Left to the executor, the missing value nullifies the
 * action, which bubbles up through the non-null chain until it nullifies the
 * envelope's whole operation list, and the caller receives a partial response
 * beside "Cannot return null for non-nullable field Action.id" - which says
 * nothing about which operation, and which a sync client can only read as a
 * permanent GraphQL rejection, stopping its poll timer for good.
 *
 * Thrown instead, with a code that says the failure is worth polling through:
 * the document holding the operation needs repairing, but the channel serves
 * every other document, and a peer that stopped polling would stop receiving
 * those too. The code is what a client branches on, since the message is not a
 * contract.
 */
export class MalformedStoredOperationError extends GraphQLError {
  constructor(detail: string) {
    super(`Stored operation cannot be served: ${detail}`, {
      extensions: {
        code: RECOVERABLE_GRAPHQL_ERROR_CODES.malformedStoredOperation,
      },
    });
  }
}
