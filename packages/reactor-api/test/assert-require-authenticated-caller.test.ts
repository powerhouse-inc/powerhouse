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

  describe("exempt paths", () => {
    it("accepts absolute paths while the floor is on", () => {
      expect(() =>
        assertRequireAuthenticatedCallerAllowed(true, true, [
          "/graphql/public",
          "/graphql/invites",
        ]),
      ).not.toThrow();
    });

    it("throws when exemptions are configured with the floor off", () => {
      expect(() =>
        assertRequireAuthenticatedCallerAllowed(false, true, [
          "/graphql/public",
        ]),
      ).toThrow(/REQUIRE_AUTHENTICATED_CALLER_EXEMPT_PATHS/);
    });

    it("throws on a path that cannot match, and names it", () => {
      expect(() =>
        assertRequireAuthenticatedCallerAllowed(true, true, ["graphql/public"]),
      ).toThrow(/"graphql\/public"/);
    });

    it("still refuses the floor without identity resolution, exemptions or not", () => {
      expect(() =>
        assertRequireAuthenticatedCallerAllowed(true, false, [
          "/graphql/public",
        ]),
      ).toThrow(/REQUIRE_AUTHENTICATED_CALLER/);
    });
  });
});
