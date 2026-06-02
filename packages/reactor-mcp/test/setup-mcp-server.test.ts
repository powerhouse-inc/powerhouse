/**
 * Unit tests for setupMcpServer (packages/reactor-mcp/src/mcp-routes.ts).
 *
 * Verifies that:
 * - mountNodeRoute is called for POST, GET, and DELETE on /mcp
 * - The GET and DELETE handlers return 405 Method Not Allowed
 * - The POST handler delegates to the MCP transport (via a mock McpServer)
 * - A fresh McpServer is created per POST request (regression for the
 *   "Already connected to a transport" unhandled rejection — see Sentry
 *   issue POWERHOUSE-9)
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { IReactorClient, ISyncManager } from "@powerhousedao/reactor";
import type { IncomingMessage, ServerResponse } from "node:http";
import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── mock createServer so we don't spin up real MCP tool registrations ─────────
// Each call returns a fresh server-like object; tests assert that the route
// handler creates one server per request, not a single shared instance.

type MockServer = {
  connect: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
};

const createdServers: MockServer[] = [];

vi.mock("../src/server.js", () => ({
  createServer: vi.fn(),
}));

// Static imports — vi.mock() is hoisted so the mock above is applied first.
import { createServer } from "../src/server.js";
import { setupMcpServer } from "../src/mcp-routes.js";

beforeEach(() => {
  createdServers.length = 0;
  vi.mocked(createServer).mockImplementation(() => {
    const server: MockServer = {
      connect: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    createdServers.push(server);
    return Promise.resolve(server as unknown as McpServer);
  });
});

// ── helpers ───────────────────────────────────────────────────────────────────

type RouteEntry = {
  method: "DELETE" | "GET" | "POST";
  path: string;
  handler: (
    req: IncomingMessage,
    res: ServerResponse,
    body?: unknown,
  ) => void | Promise<void>;
};

function makeMockAdapter() {
  const routes: RouteEntry[] = [];
  const adapter = {
    mountNodeRoute: vi.fn(
      (
        method: "DELETE" | "GET" | "POST",
        path: string,
        handler: RouteEntry["handler"],
      ) => {
        routes.push({ method, path, handler });
      },
    ),
  };
  return { adapter, routes };
}

function makeMockResponse() {
  const res = new EventEmitter() as ServerResponse;
  const written: {
    status: number;
    headers: Record<string, string>;
    body: string;
  } = {
    status: 0,
    headers: {},
    body: "",
  };
  res.writeHead = vi.fn((status: number, headers?: Record<string, string>) => {
    written.status = status;
    if (headers) Object.assign(written.headers, headers);
    return res;
  }) as unknown as typeof res.writeHead;
  res.end = vi.fn((chunk?: unknown) => {
    if (typeof chunk === "string") written.body = chunk;
    return res;
  }) as unknown as typeof res.end;
  return { res, written };
}

/** Returns a fresh transport factory mock for each POST-handler test. */
function makeTransportMock() {
  const handleRequest = vi.fn().mockResolvedValue(undefined);
  const close = vi.fn().mockResolvedValue(undefined);
  // Use a plain factory function (not a constructor) to avoid `new vi.fn()`
  // constructor semantics that differ between macOS and Linux/CI environments.
  const createTransport = vi.fn().mockReturnValue({ handleRequest, close });
  return {
    Transport: createTransport as unknown as Parameters<
      typeof setupMcpServer
    >[2],
    handleRequest,
    close,
    createTransport,
  };
}

const mockClient = {} as IReactorClient;
const mockSyncManager = {} as ISyncManager;

// ── tests ─────────────────────────────────────────────────────────────────────

describe("setupMcpServer", () => {
  it("registers routes for POST, GET, and DELETE on /mcp", async () => {
    const { adapter, routes } = makeMockAdapter();
    await setupMcpServer(
      { client: mockClient, syncManager: mockSyncManager },
      adapter,
    );

    expect(adapter.mountNodeRoute).toHaveBeenCalledTimes(3);
    const methods = routes.map((r) => r.method);
    expect(methods).toContain("POST");
    expect(methods).toContain("GET");
    expect(methods).toContain("DELETE");
  });

  it("registers all routes at /mcp", async () => {
    const { adapter, routes } = makeMockAdapter();
    await setupMcpServer({ client: mockClient }, adapter);

    for (const route of routes) {
      expect(route.path).toBe("/mcp");
    }
  });

  it("does not create an McpServer at setup time", async () => {
    const { adapter } = makeMockAdapter();
    await setupMcpServer({ client: mockClient }, adapter);

    // Server creation must be deferred to per-request handlers — building one
    // up front and sharing it caused the "Already connected" rejection.
    expect(createServer).not.toHaveBeenCalled();
  });

  it("GET /mcp handler responds with 405", async () => {
    const { adapter, routes } = makeMockAdapter();
    await setupMcpServer({ client: mockClient }, adapter);

    const getRoute = routes.find((r) => r.method === "GET");
    expect(getRoute).toBeDefined();

    const fakeReq = {} as IncomingMessage;
    const { res, written } = makeMockResponse();
    await getRoute!.handler(fakeReq, res);

    expect(written.status).toBe(405);
  });

  it("DELETE /mcp handler responds with 405", async () => {
    const { adapter, routes } = makeMockAdapter();
    await setupMcpServer({ client: mockClient }, adapter);

    const deleteRoute = routes.find((r) => r.method === "DELETE");
    expect(deleteRoute).toBeDefined();

    const fakeReq = {} as IncomingMessage;
    const { res, written } = makeMockResponse();
    await deleteRoute!.handler(fakeReq, res);

    expect(written.status).toBe(405);
  });

  it("GET and DELETE response bodies contain a JSON-RPC error", async () => {
    const { adapter, routes } = makeMockAdapter();
    await setupMcpServer({ client: mockClient }, adapter);

    for (const method of ["GET", "DELETE"] as const) {
      const route = routes.find((r) => r.method === method)!;
      const { res, written } = makeMockResponse();
      await route.handler({} as IncomingMessage, res);

      const body = JSON.parse(written.body) as { error: { message: string } };
      expect(body.error.message).toBeTruthy();
    }
  });

  // ── POST /mcp handler ───────────────────────────────────────────────────────

  describe("POST /mcp handler", () => {
    /** Run a POST handler invocation and await its async work. */
    async function invokePost(
      routes: RouteEntry[],
      body?: unknown,
    ): Promise<{ req: IncomingMessage; res: ServerResponse }> {
      const postRoute = routes.find((r) => r.method === "POST")!;
      const fakeReq = {} as IncomingMessage;
      const { res } = makeMockResponse();
      await postRoute.handler(fakeReq, res, body);
      return { req: fakeReq, res };
    }

    it("calls transport.handleRequest with (req, res, body)", async () => {
      const { Transport, handleRequest } = makeTransportMock();
      const { adapter, routes } = makeMockAdapter();
      await setupMcpServer({ client: mockClient }, adapter, Transport);

      const body = { jsonrpc: "2.0", method: "initialize", id: 1 };
      const { req, res } = await invokePost(routes, body);

      expect(handleRequest).toHaveBeenCalledOnce();
      expect(handleRequest).toHaveBeenCalledWith(req, res, body);
    });

    it("creates a fresh transport per request for stateless isolation", async () => {
      const { Transport, handleRequest } = makeTransportMock();
      const { adapter, routes } = makeMockAdapter();
      await setupMcpServer({ client: mockClient }, adapter, Transport);

      await invokePost(routes);
      await invokePost(routes);

      expect(Transport).toHaveBeenCalledTimes(2);
      expect(handleRequest).toHaveBeenCalledTimes(2);
    });

    it("creates a fresh McpServer per request and connects it to its transport", async () => {
      const { Transport } = makeTransportMock();
      const { adapter, routes } = makeMockAdapter();
      await setupMcpServer({ client: mockClient }, adapter, Transport);

      await invokePost(routes);
      await invokePost(routes);

      // One server per request — the regression we're guarding against was a
      // single shared server whose Protocol could only hold one transport.
      expect(createdServers).toHaveLength(2);
      expect(createdServers[0]).not.toBe(createdServers[1]);

      const transports = (
        Transport as unknown as { mock: { results: { value: unknown }[] } }
      ).mock.results;
      expect(createdServers[0].connect).toHaveBeenCalledWith(
        transports[0].value,
      );
      expect(createdServers[1].connect).toHaveBeenCalledWith(
        transports[1].value,
      );
    });

    it("does not produce an unhandled rejection when invoked concurrently without close", async () => {
      // Regression test for Sentry POWERHOUSE-9: with a shared McpServer, the
      // second request's `server.connect(transport)` rejected with "Already
      // connected to a transport" while the first response was still alive
      // (no `res.on("close")` had fired yet). The original `void` call let
      // that rejection escape as an unhandled promise rejection.
      //
      // With the fix (per-request McpServer + awaited connect inside try/catch),
      // both invocations resolve cleanly and nothing escapes.
      const rejections: unknown[] = [];
      const onRejection = (reason: unknown) => rejections.push(reason);
      process.on("unhandledRejection", onRejection);
      try {
        const { Transport } = makeTransportMock();
        const { adapter, routes } = makeMockAdapter();
        await setupMcpServer({ client: mockClient }, adapter, Transport);

        const postRoute = routes.find((r) => r.method === "POST")!;
        const { res: res1 } = makeMockResponse();
        const { res: res2 } = makeMockResponse();

        // Fire both handlers without awaiting between them and without
        // emitting "close" on either response — exactly the production race.
        const p1 = Promise.resolve(
          postRoute.handler({} as IncomingMessage, res1),
        );
        const p2 = Promise.resolve(
          postRoute.handler({} as IncomingMessage, res2),
        );
        await Promise.all([p1, p2]);
        // Yield to the macrotask queue so any deferred rejection would surface.
        await new Promise((resolve) => setImmediate(resolve));

        expect(rejections).toEqual([]);
        expect(createdServers).toHaveLength(2);
      } finally {
        process.off("unhandledRejection", onRejection);
      }
    });

    it("returns a 500 when server.connect rejects, without escaping the rejection", async () => {
      // Verifies the try/catch around the awaited connect — even if the
      // underlying SDK rejects, the handler must respond with 500 instead
      // of leaking an unhandled rejection.
      vi.mocked(createServer).mockImplementationOnce(() => {
        const server: MockServer = {
          connect: vi
            .fn()
            .mockRejectedValue(new Error("Already connected to a transport")),
          close: vi.fn().mockResolvedValue(undefined),
        };
        createdServers.push(server);
        return Promise.resolve(server as unknown as McpServer);
      });

      const rejections: unknown[] = [];
      const onRejection = (reason: unknown) => rejections.push(reason);
      process.on("unhandledRejection", onRejection);
      try {
        const { Transport } = makeTransportMock();
        const { adapter, routes } = makeMockAdapter();
        await setupMcpServer({ client: mockClient }, adapter, Transport);

        const postRoute = routes.find((r) => r.method === "POST")!;
        const { res, written } = makeMockResponse();
        await postRoute.handler({} as IncomingMessage, res);
        await new Promise((resolve) => setImmediate(resolve));

        expect(rejections).toEqual([]);
        expect(written.status).toBe(500);
        const body = JSON.parse(written.body) as {
          error: { code: number; message: string };
        };
        expect(body.error.code).toBe(-32603);
      } finally {
        process.off("unhandledRejection", onRejection);
      }
    });

    it("closes the transport when the response 'close' event fires", async () => {
      const { Transport, close } = makeTransportMock();
      const { adapter, routes } = makeMockAdapter();
      await setupMcpServer({ client: mockClient }, adapter, Transport);

      const postRoute = routes.find((r) => r.method === "POST")!;
      const { res } = makeMockResponse();
      await postRoute.handler({} as IncomingMessage, res);

      // Simulate connection drop / response finish
      res.emit("close");
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(close).toHaveBeenCalled();
    });
  });
});
