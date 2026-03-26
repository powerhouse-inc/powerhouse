/**
 * Unit tests for setupMcpServer (packages/reactor-mcp/src/mcp-routes.ts).
 *
 * Verifies that:
 * - mountNodeRoute is called for POST, GET, and DELETE on /mcp
 * - The GET and DELETE handlers return 405 Method Not Allowed
 * - The POST handler delegates to the MCP transport (via a mock McpServer)
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { IReactorClient, ISyncManager } from "@powerhousedao/reactor";
import type { IncomingMessage, ServerResponse } from "node:http";
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

// ── mock createServer so we don't spin up real MCP tool registrations ─────────

vi.mock("../src/server.js", () => ({
  createServer: vi.fn().mockResolvedValue({
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  } satisfies Partial<McpServer> as unknown as McpServer),
}));

// Static import — vi.mock() is hoisted so the mock above is applied first.
import { setupMcpServer } from "../src/mcp-routes.js";

// ── helpers ───────────────────────────────────────────────────────────────────

type RouteEntry = {
  method: "DELETE" | "GET" | "POST";
  path: string;
  handler: (req: IncomingMessage, res: ServerResponse, body?: unknown) => void;
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

  it("GET /mcp handler responds with 405", async () => {
    const { adapter, routes } = makeMockAdapter();
    await setupMcpServer({ client: mockClient }, adapter);

    const getRoute = routes.find((r) => r.method === "GET");
    expect(getRoute).toBeDefined();

    const fakeReq = {} as IncomingMessage;
    const { res, written } = makeMockResponse();
    getRoute!.handler(fakeReq, res);

    expect(written.status).toBe(405);
  });

  it("DELETE /mcp handler responds with 405", async () => {
    const { adapter, routes } = makeMockAdapter();
    await setupMcpServer({ client: mockClient }, adapter);

    const deleteRoute = routes.find((r) => r.method === "DELETE");
    expect(deleteRoute).toBeDefined();

    const fakeReq = {} as IncomingMessage;
    const { res, written } = makeMockResponse();
    deleteRoute!.handler(fakeReq, res);

    expect(written.status).toBe(405);
  });

  it("GET and DELETE response bodies contain a JSON-RPC error", async () => {
    const { adapter, routes } = makeMockAdapter();
    await setupMcpServer({ client: mockClient }, adapter);

    for (const method of ["GET", "DELETE"] as const) {
      const route = routes.find((r) => r.method === method)!;
      const { res, written } = makeMockResponse();
      route.handler({} as IncomingMessage, res);

      const body = JSON.parse(written.body) as { error: { message: string } };
      expect(body.error.message).toBeTruthy();
    }
  });

  it("returns the McpServer instance", async () => {
    const { adapter } = makeMockAdapter();
    const result = await setupMcpServer({ client: mockClient }, adapter);

    expect(result).toBeDefined();
    expect(typeof result.connect).toBe("function");
  });

  // ── POST /mcp handler ───────────────────────────────────────────────────────

  describe("POST /mcp handler", () => {
    /** Run a POST handler invocation and wait for async fire-and-forget calls. */
    async function invokePost(
      routes: RouteEntry[],
      body?: unknown,
    ): Promise<{ req: IncomingMessage; res: ServerResponse }> {
      const postRoute = routes.find((r) => r.method === "POST")!;
      const fakeReq = {} as IncomingMessage;
      const { res } = makeMockResponse();
      postRoute.handler(fakeReq, res, body);
      // transport.handleRequest and server.connect are void-called (fire-and-forget)
      await new Promise((resolve) => setTimeout(resolve, 0));
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

    it("connects the server to the new transport before handling the request", async () => {
      const { Transport } = makeTransportMock();
      const { adapter, routes } = makeMockAdapter();
      const server = await setupMcpServer(
        { client: mockClient },
        adapter,
        Transport,
      );

      await invokePost(routes);

      const rawTransport = (
        Transport as unknown as { mock: { results: { value: unknown }[] } }
      ).mock.results[0]?.value;
      expect(server.connect).toHaveBeenCalledWith(rawTransport);
    });

    it("closes the transport when the response 'close' event fires", async () => {
      const { Transport, close } = makeTransportMock();
      const { adapter, routes } = makeMockAdapter();
      await setupMcpServer({ client: mockClient }, adapter, Transport);

      const postRoute = routes.find((r) => r.method === "POST")!;
      const { res } = makeMockResponse();
      postRoute.handler({} as IncomingMessage, res);

      // Simulate connection drop / response finish
      res.emit("close");
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(close).toHaveBeenCalled();
    });
  });
});
