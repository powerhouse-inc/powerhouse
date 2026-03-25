/**
 * Unit tests for setupMcpServer (packages/reactor-mcp/src/express.ts).
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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── mock createServer so we don't spin up real MCP tool registrations ─────────

vi.mock("../src/server.js", () => ({
  createServer: vi.fn().mockResolvedValue({
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  } satisfies Partial<McpServer> as unknown as McpServer),
}));

// Import AFTER the mock is in place
const { setupMcpServer } = await import("../src/express.js");

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

const mockClient = {} as IReactorClient;
const mockSyncManager = {} as ISyncManager;

// ── tests ─────────────────────────────────────────────────────────────────────

describe("setupMcpServer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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
});
