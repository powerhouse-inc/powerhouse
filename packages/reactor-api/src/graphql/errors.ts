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
