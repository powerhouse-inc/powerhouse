import { describe, expect, it } from "vitest";
import { assertRequireAuthenticatedCallerAllowed } from "../src/server.js";

describe("assertRequireAuthenticatedCallerAllowed", () => {
  it("is a no-op when the middleware is not requested", () => {
    expect(() =>
      assertRequireAuthenticatedCallerAllowed(false, false),
    ).not.toThrow();
  });

  it("is a no-op when identity resolution is on, whatever the policy", () => {
    expect(() =>
      assertRequireAuthenticatedCallerAllowed(true, true),
    ).not.toThrow();
  });

  it("throws when requested without identity resolution (fail closed)", () => {
    expect(() => assertRequireAuthenticatedCallerAllowed(true, false)).toThrow(
      /REQUIRE_AUTHENTICATED_CALLER/,
    );
  });

  it("names the fix in the error", () => {
    expect(() => assertRequireAuthenticatedCallerAllowed(true, false)).toThrow(
      /RESOLVE_CALLER_IDENTITY/,
    );
  });
});
