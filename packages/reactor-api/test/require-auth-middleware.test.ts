/**
 * The require-authenticated-caller middleware, and the paths it exempts.
 *
 * The exemption is composed the way the server composes it — behind the auth
 * middleware — because the two are only correct together: the auth middleware
 * is what records whether a caller was resolved, and the exemption is a decision
 * about what to do when one was not.
 */

import { describe, expect, it } from "vitest";
import { createAuthFetchMiddleware } from "../src/graphql/gateway/auth-middleware.js";
import { createRequireAuthFetchMiddleware } from "../src/graphql/gateway/require-auth-middleware.js";
import type { FetchHandler } from "../src/graphql/gateway/types.js";
import type { AuthContext, AuthService } from "../src/services/auth.service.js";

const OK = "served";

const served: FetchHandler = () =>
  Promise.resolve(new globalThis.Response(OK, { status: 200 }));

/**
 * An auth service that resolves whoever it is told to, so a test can say
 * "signed in" or "anonymous" without minting a token. `authenticateRequest` is
 * the whole surface the auth middleware uses.
 */
function authServiceResolving(user: AuthContext["user"]): AuthService {
  return {
    authenticateRequest: () =>
      Promise.resolve({ user, admins: [], auth_enabled: false }),
  } as unknown as AuthService;
}

const SIGNED_IN = authServiceResolving({
  address: "0xuser",
  chainId: 1,
  networkId: "eip155",
  appKey: "did:key:zApp",
} as AuthContext["user"]);

const ANONYMOUS = authServiceResolving(undefined);

/** The chain as `#composeFetchMiddleware` builds it: auth first, then the floor. */
function chain(authService: AuthService, exemptPaths?: string[]): FetchHandler {
  return createAuthFetchMiddleware(authService)(
    createRequireAuthFetchMiddleware(exemptPaths)(served),
  );
}

async function call(
  handler: FetchHandler,
  url: string,
  method = "POST",
): Promise<globalThis.Response> {
  return handler(new globalThis.Request(url, { method }));
}

describe("createRequireAuthFetchMiddleware", () => {
  describe("with no exempt paths (the existing behaviour)", () => {
    it("serves an authenticated caller", async () => {
      const response = await call(
        chain(SIGNED_IN),
        "http://host/graphql/admin",
      );
      expect(response.status).toBe(200);
    });

    it("refuses an anonymous caller with 401", async () => {
      const response = await call(
        chain(ANONYMOUS),
        "http://host/graphql/admin",
      );
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        error: "Authentication required",
      });
    });

    it("lets a CORS preflight through", async () => {
      const response = await call(
        chain(ANONYMOUS),
        "http://host/graphql/admin",
        "OPTIONS",
      );
      expect(response.status).toBe(200);
    });
  });

  describe("with exempt paths", () => {
    const exempt = ["/graphql/public"];

    it("serves an anonymous caller on an exempt path", async () => {
      const response = await call(
        chain(ANONYMOUS, exempt),
        "http://host/graphql/public",
      );
      expect(response.status).toBe(200);
      await expect(response.text()).resolves.toBe(OK);
    });

    it("still refuses an anonymous caller everywhere else", async () => {
      for (const path of ["/graphql/admin", "/graphql", "/"]) {
        const response = await call(
          chain(ANONYMOUS, exempt),
          `http://host${path}`,
        );
        expect(response.status, path).toBe(401);
      }
    });

    it("does not exempt a path that merely starts with an exempt one", async () => {
      for (const path of [
        "/graphql/public-admin",
        "/graphql/publicity",
        "/graphql/public/nested",
      ]) {
        const response = await call(
          chain(ANONYMOUS, exempt),
          `http://host${path}`,
        );
        expect(response.status, path).toBe(401);
      }
    });

    it("ignores a trailing slash on either side", async () => {
      await expect(
        call(chain(ANONYMOUS, exempt), "http://host/graphql/public/").then(
          (r) => r.status,
        ),
      ).resolves.toBe(200);
      await expect(
        call(
          chain(ANONYMOUS, ["/graphql/public/"]),
          "http://host/graphql/public",
        ).then((r) => r.status),
      ).resolves.toBe(200);
    });

    it("ignores the query string and only matches the path", async () => {
      const response = await call(
        chain(ANONYMOUS, exempt),
        "http://host/graphql/public?code=abc",
      );
      expect(response.status).toBe(200);
    });

    it("exempts every configured path, not just the first", async () => {
      const handler = chain(ANONYMOUS, ["/graphql/public", "/graphql/invites"]);
      for (const path of ["/graphql/public", "/graphql/invites"]) {
        const response = await call(handler, `http://host${path}`);
        expect(response.status, path).toBe(200);
      }
    });

    it("serves an authenticated caller on an exempt path too", async () => {
      const response = await call(
        chain(SIGNED_IN, exempt),
        "http://host/graphql/public",
      );
      expect(response.status).toBe(200);
    });

    it("is unchanged by an empty list", async () => {
      const response = await call(
        chain(ANONYMOUS, []),
        "http://host/graphql/public",
      );
      expect(response.status).toBe(401);
    });
  });
});
