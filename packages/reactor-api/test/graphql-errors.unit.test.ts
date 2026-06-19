import { DRIVE_AUTH_ERROR_MESSAGES } from "@powerhousedao/reactor";
import { describe, expect, it } from "vitest";
import {
  AuthenticationRequiredError,
  ForbiddenError,
} from "../src/graphql/errors.js";

const INSUFFICIENT_PERMISSIONS = DRIVE_AUTH_ERROR_MESSAGES.forbidden;
const AUTHENTICATION_REQUIRED =
  DRIVE_AUTH_ERROR_MESSAGES.authenticationRequired;

describe("ForbiddenError", () => {
  it("carries the FORBIDDEN code", () => {
    expect(new ForbiddenError().extensions.code).toBe("FORBIDDEN");
  });

  it("uses the shared message prefix, with and without detail", () => {
    expect(new ForbiddenError().message).toBe(INSUFFICIENT_PERMISSIONS);
    expect(new ForbiddenError("to read this document").message).toBe(
      `${INSUFFICIENT_PERMISSIONS} to read this document`,
    );
  });

  it("emits a message the client treats as an auth rejection", () => {
    const msg = new ForbiddenError("to read this document").message;
    expect(
      Object.values(DRIVE_AUTH_ERROR_MESSAGES).some((m) => msg.includes(m)),
    ).toBe(true);
  });
});

describe("AuthenticationRequiredError", () => {
  it("carries the UNAUTHENTICATED code and shared prefix", () => {
    const err = new AuthenticationRequiredError("to create documents");
    expect(err.extensions.code).toBe("UNAUTHENTICATED");
    expect(err.message).toBe(`${AUTHENTICATION_REQUIRED} to create documents`);
  });
});
