import { GraphQLError } from "graphql";
import { DRIVE_AUTH_ERROR_MESSAGES } from "@powerhousedao/reactor";

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
