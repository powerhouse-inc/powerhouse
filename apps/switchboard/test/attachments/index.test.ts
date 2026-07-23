import type { API, AuthService } from "@powerhousedao/reactor-api";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { mountAuthenticatedNodeRoute } from "../../src/attachments/mount-auth.js";

type Captured = {
  method: string;
  path: string;
  handler: (
    req: IncomingMessage,
    res: ServerResponse,
    body?: unknown,
  ) => void | Promise<void>;
};

function makeFakeApi(authService: AuthService | undefined): {
  api: Pick<API, "httpAdapter" | "authService">;
  captured: Captured[];
} {
  const captured: Captured[] = [];
  const api = {
    httpAdapter: {
      mountNodeRoute: (
        method: string,
        path: string,
        handler: Captured["handler"],
      ) => {
        captured.push({ method, path, handler });
      },
    },
    authService,
  } as unknown as Pick<API, "httpAdapter" | "authService">;
  return { api, captured };
}

function makeReq(headers: Record<string, string> = {}): IncomingMessage {
  return { method: "POST", url: "/x", headers } as unknown as IncomingMessage;
}

function makeRes() {
  const headers: Record<string, string> = {};
  let body = "";
  const res = {
    statusCode: 200,
    setHeader(name: string, value: string | number | readonly string[]) {
      headers[name.toLowerCase()] = String(value);
    },
    end(chunk?: string | Buffer) {
      if (chunk !== undefined) {
        body += typeof chunk === "string" ? chunk : chunk.toString("utf8");
      }
    },
  } as unknown as ServerResponse;
  Object.defineProperty(res, "_headers", { get: () => headers });
  Object.defineProperty(res, "_body", { get: () => body });
  return res as ServerResponse & {
    readonly _headers: Record<string, string>;
    readonly _body: string;
  };
}

describe("mountAuthenticatedNodeRoute", () => {
  it("wraps the handler with auth enforcement when authService is defined", async () => {
    const verifyBearer = vi.fn(() =>
      Promise.resolve({
        user: undefined,
        admins: [],
        auth_enabled: true,
      }),
    );
    const authService = { verifyBearer } as unknown as AuthService;
    const { api, captured } = makeFakeApi(authService);
    const inner = vi.fn();

    mountAuthenticatedNodeRoute(api, "POST", "/x", inner);

    expect(captured).toHaveLength(1);
    expect(captured[0].method).toBe("POST");
    expect(captured[0].path).toBe("/x");
    // The mounted handler must NOT be the raw inner handler — it must be wrapped.
    expect(captured[0].handler).not.toBe(inner);

    const res = makeRes();
    await captured[0].handler(makeReq(), res);

    expect(verifyBearer).toHaveBeenCalledTimes(1);
    expect(inner).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res._body)).toEqual({ error: "Authentication required" });
  });

  it("invokes the inner handler when verifyBearer returns a valid user", async () => {
    const verifyBearer = vi.fn(() =>
      Promise.resolve({
        user: { address: "0x1", chainId: 1, networkId: "mainnet" },
        admins: [],
        auth_enabled: true,
      }),
    );
    const authService = { verifyBearer } as unknown as AuthService;
    const { api, captured } = makeFakeApi(authService);
    const inner = vi.fn();

    mountAuthenticatedNodeRoute(api, "GET", "/x", inner);

    await captured[0].handler(
      makeReq({ authorization: "Bearer t" }),
      makeRes(),
    );

    expect(inner).toHaveBeenCalledTimes(1);
  });

  it("mounts a wrapper that forwards the anonymous actor when authService is undefined", async () => {
    const { api, captured } = makeFakeApi(undefined);
    const inner = vi.fn();

    mountAuthenticatedNodeRoute(api, "PUT", "/x", inner);

    expect(captured).toHaveLength(1);

    const req = makeReq();
    const res = makeRes();
    await captured[0].handler(req, res);

    expect(inner).toHaveBeenCalledWith(req, res, undefined, {
      user: undefined,
      authEnabled: false,
    });
  });
});
