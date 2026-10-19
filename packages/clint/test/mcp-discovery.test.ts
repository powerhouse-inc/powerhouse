// @ts-nocheck — NOTE(port): the ph-clint repo never typechecked its test suite
// (jest ran transpile-only); this file carries pre-existing type drift. Runtime
// assertions are unchanged. Tighten opportunistically when touching the file.
import { describe, it, expect, beforeEach } from "vitest";
import {
  discoverMcpTools,
  disconnectAllMcp,
} from "../src/integrations/mastra/mcp.js";
import type {
  ServiceInstanceStatus,
  ServiceManager,
} from "../src/core/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal ServiceManager mock that returns a fixed list of instances. */
function mockServices(instances: ServiceInstanceStatus[]): ServiceManager {
  return {
    list: () => instances,
    start: async () => "",
    stop: async () => {},
    getDefinition: () => undefined,
    logs: () => "",
    watchLogs: () => () => {},
    scanProjects: () => [],
    purgeStoppedInstances: () => {},
  };
}

/** Creates a ready service instance with an MCP endpoint. */
function readyInstance(opts: {
  serviceId: string;
  instanceId: string;
  mcpUrl: string;
}): ServiceInstanceStatus {
  return {
    serviceId: opts.serviceId,
    instanceId: opts.instanceId,
    name: "Test Service",
    status: "ready",
    pid: 1234,
    endpoints: { "mcp-server": opts.mcpUrl },
    endpointTypes: { "mcp-server": "api-mcp" },
  };
}

/** Tracks connect/disconnect/listTools calls on fake MCPClient instances. */
interface FakeClient {
  id: string;
  disconnected: boolean;
  listToolsCalls: number;
  tools: Record<string, unknown>;
}

const createdClients: FakeClient[] = [];

function FakeMCPClient(config: {
  id: string;
  servers: Record<string, { url: URL }>;
}) {
  const fake: FakeClient = {
    id: config.id,
    disconnected: false,
    listToolsCalls: 0,
    tools: {},
  };

  // Name tools using the server key convention Mastra uses: `{serverKey}_{toolName}`
  const serverKey = Object.keys(config.servers)[0];
  fake.tools = {
    [`${serverKey}_getDrives`]: { execute: () => {} },
    [`${serverKey}_getDocument`]: { execute: () => {} },
  };

  createdClients.push(fake);

  return {
    listTools: async () => {
      fake.listToolsCalls++;
      if (fake.disconnected) throw new Error("Client disconnected");
      return fake.tools;
    },
    disconnect: async () => {
      fake.disconnected = true;
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(async () => {
  createdClients.length = 0;
  await disconnectAllMcp();
});

describe("discoverMcpTools", () => {
  it("discovers tools from a running service with api-mcp endpoint", async () => {
    const services = mockServices([
      readyInstance({
        serviceId: "reactor-project",
        instanceId: "reactor-project:abc123",
        mcpUrl: "http://localhost:4001/mcp",
      }),
    ]);

    const tools = await discoverMcpTools(services, undefined, FakeMCPClient);

    expect(Object.keys(tools).sort()).toEqual([
      "reactor-project-mcp__getDocument",
      "reactor-project-mcp__getDrives",
    ]);
    expect(createdClients).toHaveLength(1);
  });

  it("returns empty when no services are ready", async () => {
    const services = mockServices([
      {
        serviceId: "reactor-project",
        instanceId: "reactor-project:abc123",
        name: "Test",
        status: "stopped",
        endpoints: { "mcp-server": "http://localhost:4001/mcp" },
        endpointTypes: { "mcp-server": "api-mcp" },
      },
    ]);

    const tools = await discoverMcpTools(services, undefined, FakeMCPClient);
    expect(tools).toEqual({});
    expect(createdClients).toHaveLength(0);
  });

  it("reuses cached client for same URL and same instanceId", async () => {
    const services = mockServices([
      readyInstance({
        serviceId: "reactor-project",
        instanceId: "reactor-project:abc123",
        mcpUrl: "http://localhost:4001/mcp",
      }),
    ]);

    await discoverMcpTools(services, undefined, FakeMCPClient);
    await discoverMcpTools(services, undefined, FakeMCPClient);

    // Only one client created, but listTools called twice
    expect(createdClients).toHaveLength(1);
    expect(createdClients[0].listToolsCalls).toBe(2);
  });

  it("invalidates cached client when instanceId changes for same URL", async () => {
    // First call: instance A
    const servicesA = mockServices([
      readyInstance({
        serviceId: "reactor-project",
        instanceId: "reactor-project:aaa111",
        mcpUrl: "http://localhost:4001/mcp",
      }),
    ]);
    await discoverMcpTools(servicesA, undefined, FakeMCPClient);
    expect(createdClients).toHaveLength(1);
    const clientA = createdClients[0];

    // Second call: instance B at the same URL (service was stopped and restarted)
    const servicesB = mockServices([
      readyInstance({
        serviceId: "reactor-project",
        instanceId: "reactor-project:bbb222",
        mcpUrl: "http://localhost:4001/mcp",
      }),
    ]);
    const tools = await discoverMcpTools(servicesB, undefined, FakeMCPClient);

    // Old client disconnected, new one created
    expect(clientA.disconnected).toBe(true);
    expect(createdClients).toHaveLength(2);
    const clientB = createdClients[1];
    expect(clientB.disconnected).toBe(false);
    expect(clientB.listToolsCalls).toBe(1);

    // Tools still work
    expect(Object.keys(tools).length).toBe(2);
  });

  it("disconnects client when URL disappears from active services", async () => {
    const services = mockServices([
      readyInstance({
        serviceId: "reactor-project",
        instanceId: "reactor-project:abc123",
        mcpUrl: "http://localhost:4001/mcp",
      }),
    ]);
    await discoverMcpTools(services, undefined, FakeMCPClient);
    expect(createdClients).toHaveLength(1);

    // All services stopped
    const emptyServices = mockServices([]);
    await discoverMcpTools(emptyServices, undefined, FakeMCPClient);

    expect(createdClients[0].disconnected).toBe(true);
  });
});
