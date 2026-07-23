import type { AuthService } from "@powerhousedao/reactor-api";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { requireAuth, type NodeHandler } from "../../src/attachments/auth.js";

type CapturedRes = ServerResponse & {
  _headers: Record<string, string>;
  _body: string;
  _ended: boolean;
};

function makeReq(opts: {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
}): IncomingMessage {
  return {
    method: opts.method ?? "POST",
    url: opts.url ?? "/attachments/reservations/abc",
    headers: opts.headers ?? {},
  } as unknown as IncomingMessage;
}

function makeRes(): CapturedRes {
  const headers: Record<string, string> = {};
  let body = "";
  let ended = false;
  const res = {
    statusCode: 200,
    setHeader(name: string, value: string | number | readonly string[]) {
      headers[name.toLowerCase()] = String(value);
    },
    getHeader(name: string) {
      return headers[name.toLowerCase()];
    },
    end(chunk?: string | Buffer) {
      if (chunk !== undefined) {
        body += typeof chunk === "string" ? chunk : chunk.toString("utf8");
      }
      ended = true;
    },
  } as unknown as CapturedRes;
  Object.defineProperty(res, "_headers", { get: () => headers });
  Object.defineProperty(res, "_body", { get: () => body });
  Object.defineProperty(res, "_ended", { get: () => ended });
  return res;
}

function makeAuthService(
  impl: (authorization: string | undefined) => Promise<unknown>,
): {
  service: AuthService;
  spy: ReturnType<typeof vi.fn>;
} {
  const spy = vi.fn(
    impl as (authorization: string | undefined) => Promise<unknown>,
  );
  const service = { verifyBearer: spy } as unknown as AuthService;
  return { service, spy };
}

describe("requireAuth", () => {
  it("invokes the handler with the anonymous actor when authService is undefined (auth disabled path)", async () => {
    const handler = vi.fn<NodeHandler>();
    const wrapped = requireAuth(undefined, handler);
    const req = makeReq({});
    const res = makeRes();
    await wrapped(req, res);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(req, res, undefined, {
      user: undefined,
      authEnabled: false,
    });
  });

  it("ignores caller identity headers in auth-disabled mode", async () => {
    const handler = vi.fn<NodeHandler>();
    const wrapped = requireAuth(undefined, handler);
    const req = makeReq({
      headers: {
        "x-user-address": "0xspoofed",
        "user-address": "0xspoofed",
      },
    });
    const res = makeRes();
    await wrapped(req, res);
    expect(handler).toHaveBeenCalledWith(req, res, undefined, {
      user: undefined,
      authEnabled: false,
    });
  });

  it("returns 401 with { error: 'Authentication required' } when Authorization header is missing", async () => {
    const { service, spy } = makeAuthService(() =>
      Promise.resolve({
        user: undefined,
        admins: [],
        auth_enabled: true,
      }),
    );
    const handler = vi.fn<NodeHandler>();
    const wrapped = requireAuth(service, handler);

    const res = makeRes();
    await wrapped(makeReq({ headers: {} }), res);

    expect(res.statusCode).toBe(401);
    expect(res._headers["content-type"]).toBe("application/json");
    expect(JSON.parse(res._body)).toEqual({ error: "Authentication required" });
    expect(handler).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("forwards a Response from AuthService (status, content-type, body) for an invalid bearer token", async () => {
    const { service } = makeAuthService(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: "Verification failed" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const handler = vi.fn<NodeHandler>();
    const wrapped = requireAuth(service, handler);

    const res = makeRes();
    await wrapped(
      makeReq({ headers: { authorization: "Bearer bad-token" } }),
      res,
    );

    expect(res.statusCode).toBe(401);
    expect(res._headers["content-type"]).toBe("application/json");
    expect(JSON.parse(res._body)).toEqual({ error: "Verification failed" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("forwards a Response with a non-JSON content-type verbatim", async () => {
    const { service } = makeAuthService(() =>
      Promise.resolve(
        new Response("nope", {
          status: 403,
          headers: { "content-type": "text/plain" },
        }),
      ),
    );
    const handler = vi.fn<NodeHandler>();
    const wrapped = requireAuth(service, handler);

    const res = makeRes();
    await wrapped(
      makeReq({ headers: { authorization: "Bearer bad-token" } }),
      res,
    );

    expect(res.statusCode).toBe(403);
    expect(res._headers["content-type"]).toBe("text/plain");
    expect(res._body).toBe("nope");
    expect(handler).not.toHaveBeenCalled();
  });

  it("invokes the handler and leaves the response untouched on a valid bearer token", async () => {
    const { service } = makeAuthService(() =>
      Promise.resolve({
        user: { address: "0x123", chainId: 1, networkId: "mainnet" },
        admins: [],
        auth_enabled: true,
      }),
    );
    const handler = vi.fn<NodeHandler>();
    const wrapped = requireAuth(service, handler);

    const req = makeReq({
      headers: { authorization: "Bearer good-token" },
    });
    const res = makeRes();
    await wrapped(req, res);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(req, res, undefined, {
      user: { address: "0x123", chainId: 1, networkId: "mainnet" },
      authEnabled: true,
    });
    expect(res.statusCode).toBe(200);
    expect(res._body).toBe("");
    expect(res._ended).toBe(false);
    expect(res._headers["content-type"]).toBeUndefined();
  });

  it("derives the actor only from the verified bearer, ignoring spoofed identity headers", async () => {
    const { service } = makeAuthService(() =>
      Promise.resolve({
        user: { address: "0xverified", chainId: 1, networkId: "mainnet" },
        admins: [],
        auth_enabled: true,
      }),
    );
    const handler = vi.fn<NodeHandler>();
    const wrapped = requireAuth(service, handler);
    const req = makeReq({
      headers: {
        authorization: "Bearer good-token",
        "x-user-address": "0xspoofed",
        "user-address": "0xspoofed",
      },
    });
    const res = makeRes();
    await wrapped(req, res);

    const actor = handler.mock.calls[0]?.[3];
    expect(actor?.user?.address).toBe("0xverified");
  });

  it("forwards the adapter-parsed body after successful authentication", async () => {
    const { service } = makeAuthService(() =>
      Promise.resolve({
        user: { address: "0x123", chainId: 1, networkId: "mainnet" },
        admins: [],
        auth_enabled: true,
      }),
    );
    const handler = vi.fn<NodeHandler>();
    const wrapped = requireAuth(service, handler);
    const req = makeReq({ headers: { authorization: "Bearer good-token" } });
    const res = makeRes();
    const body = { mimeType: "application/pdf" };

    await wrapped(req, res, body);

    expect(handler).toHaveBeenCalledWith(req, res, body, {
      user: { address: "0x123", chainId: 1, networkId: "mainnet" },
      authEnabled: true,
    });
  });

  it("returns 500 with a sanitized body when AuthService throws", async () => {
    const { service } = makeAuthService(async () => {
      await Promise.resolve();
      throw new Error("transient Renown failure: secret-internal-detail");
    });
    const handler = vi.fn<NodeHandler>();
    const wrapped = requireAuth(service, handler);

    const res = makeRes();
    await wrapped(
      makeReq({ headers: { authorization: "Bearer good-token" } }),
      res,
    );

    expect(res.statusCode).toBe(500);
    expect(res._headers["content-type"]).toBe("application/json");
    const parsed = JSON.parse(res._body) as { error: string };
    expect(parsed.error).toBe("Internal authentication error");
    expect(res._body).not.toContain("secret-internal-detail");
    expect(res._body).not.toContain("Renown");
    expect(handler).not.toHaveBeenCalled();
  });

  it("calls authService.verifyBearer with the incoming authorization header", async () => {
    const { service, spy } = makeAuthService(() =>
      Promise.resolve({
        user: { address: "0x1", chainId: 1, networkId: "mainnet" },
        admins: [],
        auth_enabled: true,
      }),
    );
    const wrapped = requireAuth(service, vi.fn());

    await wrapped(
      makeReq({ headers: { authorization: "Bearer t" } }),
      makeRes(),
    );

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("Bearer t");
  });

  describe("allowAnonymous", () => {
    it("passes a missing bearer through as an anonymous actor with authEnabled true", async () => {
      const { service } = makeAuthService(() =>
        Promise.resolve({
          user: undefined,
          admins: [],
          auth_enabled: true,
        }),
      );
      const handler = vi.fn<NodeHandler>();
      const wrapped = requireAuth(service, handler, { allowAnonymous: true });

      const req = makeReq({ headers: {} });
      const res = makeRes();
      await wrapped(req, res);

      expect(res.statusCode).toBe(200);
      expect(handler).toHaveBeenCalledWith(req, res, undefined, {
        user: undefined,
        authEnabled: true,
      });
    });

    it("still rejects an invalid bearer — a bad token is never downgraded to anonymous", async () => {
      const { service } = makeAuthService(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: "Verification failed" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          }),
        ),
      );
      const handler = vi.fn<NodeHandler>();
      const wrapped = requireAuth(service, handler, { allowAnonymous: true });

      const res = makeRes();
      await wrapped(
        makeReq({ headers: { authorization: "Bearer bad-token" } }),
        res,
      );

      expect(res.statusCode).toBe(401);
      expect(handler).not.toHaveBeenCalled();
    });

    it("still verifies and forwards a valid bearer identity", async () => {
      const { service } = makeAuthService(() =>
        Promise.resolve({
          user: { address: "0x123", chainId: 1, networkId: "mainnet" },
          admins: [],
          auth_enabled: true,
        }),
      );
      const handler = vi.fn<NodeHandler>();
      const wrapped = requireAuth(service, handler, { allowAnonymous: true });

      const req = makeReq({ headers: { authorization: "Bearer good-token" } });
      const res = makeRes();
      await wrapped(req, res);

      expect(handler).toHaveBeenCalledWith(req, res, undefined, {
        user: { address: "0x123", chainId: 1, networkId: "mainnet" },
        authEnabled: true,
      });
    });
  });

  it("calls verifyBearer with undefined when no authorization header is present", async () => {
    const { service, spy } = makeAuthService(() =>
      Promise.resolve({
        user: undefined,
        admins: [],
        auth_enabled: true,
      }),
    );
    const wrapped = requireAuth(service, vi.fn());

    await wrapped(makeReq({ headers: {} }), makeRes());

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(undefined);
  });
});
