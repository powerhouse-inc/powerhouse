import type {
  DocumentModelModule,
  ISigner,
} from "@powerhousedao/shared/document-model";
import type {
  Logger,
  ServiceInstanceStatus,
  ServiceManager,
} from "../../core/types.js";

/**
 * Module-level cache of MCPClient instances keyed by endpoint URL.
 * Tracks the instanceId so that same-URL restarts (stop instance A, start instance B
 * on the same port) correctly invalidate the stale client.
 */
const clients = new Map<string, { client: any; instanceId: string }>();

/**
 * Info about an active MCP endpoint discovered from running services.
 */
interface McpEndpoint {
  url: string;
  serviceId: string;
  instanceId: string;
  /** The GraphQL endpoint of the switchboard that serves it. */
  graphqlUrl: string;
}

/** The bearer of a discovered endpoint's requests; undefined sends none. */
export type McpBearer = (endpoint: {
  url: string;
  serviceId: string;
}) => Promise<string | undefined>;

/** The session a discovered endpoint's reactor tools sign as; undefined leaves them on the endpoint. */
export type McpSigner = (endpoint: {
  url: string;
  serviceId: string;
}) => Promise<ISigner | undefined>;

/**
 * How the reactor tools of discovered endpoints run in this process:
 * reactor-mcp's tools over the endpoint's switchboard GraphQL API, every
 * action signed by `signer`'s session (the agent's) and every request borne
 * by the discovery's bearer, so the agent's writes are its own.
 */
export interface McpInProcessTools {
  signer: McpSigner;
  /** The models the tools build and check documents with; default the base ones. */
  documentModels?: () => readonly DocumentModelModule[];
}

/** The switchboard GraphQL endpoint of an instance's MCP endpoint `mcpUrl`. */
function graphqlUrlOf(inst: ServiceInstanceStatus, mcpUrl: string): string {
  for (const [name, type] of Object.entries(inst.endpointTypes ?? {})) {
    const url = inst.endpoints?.[name];
    if (type === "api-graphql" && url) return url;
  }
  return mcpUrl.replace(/\/mcp\/?$/, "/graphql");
}

/**
 * reactor-mcp's tools (reads, createDocument, addActions, deleteDocument) for
 * `ep`, run in this process as Mastra tools, keyed by tool name; undefined
 * when the endpoint's session has no signer.
 */
async function inProcessReactorTools(
  ep: McpEndpoint,
  inProcess: McpInProcessTools,
  bearer: McpBearer | undefined,
): Promise<Record<string, any> | undefined> {
  const endpoint = { url: ep.url, serviceId: ep.serviceId };
  const signer = await inProcess.signer(endpoint);
  if (!signer) return undefined;
  const [
    { createTool },
    { reactorTools, toMcpTool },
    { baseDocumentModels, remoteToolClient },
    { GraphQLReactorClient },
  ] = await Promise.all([
    import("@mastra/core/tools"),
    import("@powerhousedao/reactor-mcp/tools"),
    import("@powerhousedao/reactor-mcp/remote"),
    import("@powerhousedao/reactor-browser/graphql-client"),
  ]);
  const documentModels = inProcess.documentModels ?? (() => baseDocumentModels);
  const client = new GraphQLReactorClient({
    url: ep.graphqlUrl,
    signer,
    tokenProvider: () =>
      bearer ? bearer(endpoint) : Promise.resolve(undefined),
    documentModels,
    realtime: false,
  });
  const ctx = { client: remoteToolClient(client, { documentModels }) };
  const tools: Record<string, any> = {};
  for (const definition of reactorTools()) {
    const record = toMcpTool(definition, ctx);
    tools[definition.name] = createTool({
      id: definition.name,
      description: definition.description,
      inputSchema: definition.inputSchema,
      execute: (input: unknown) => record.callback(input as never, undefined),
    });
  }
  return tools;
}

/** `fetch` that adds the bearer `bearer` mints for `endpoint`, per request. */
function fetchWithBearer(
  bearer: McpBearer,
  endpoint: { url: string; serviceId: string },
) {
  return async (url: string | URL, init?: RequestInit): Promise<Response> => {
    const token = await bearer(endpoint);
    if (!token) return fetch(url, init);
    const headers = new Headers(init?.headers);
    headers.set("authorization", `Bearer ${token}`);
    return fetch(url, { ...init, headers });
  };
}

/**
 * Discover MCP tools from running services that have `api-mcp` endpoints.
 *
 * Queries the ServiceManager for running instances, finds endpoints typed as
 * `api-mcp`, creates/reuses MCPClient connections, and returns the merged tool set.
 *
 * Tool names are prefixed with `{serviceId}-mcp__` (e.g. `vetra-mcp__getDocument`).
 * For services with multiple active instances, the instance suffix is included
 * (e.g. `vetra-abc123-mcp__getDocument`).
 *
 * @param MCPClient — Constructor from `@mastra/mcp`, must be provided by the consumer.
 *   Throws if MCP endpoints exist but no MCPClient is provided.
 * @param bearer — The bearer each endpoint's requests carry: the agent's
 *   session, so the endpoint's door knows who calls. Omitted: requests go
 *   anonymous.
 * @param inProcess — Runs each endpoint's reactor tools in this process,
 *   signed as the agent's session (see {@link McpInProcessTools}); only the
 *   endpoint's host-only tools still come from it, and only with an
 *   MCPClient. Omitted: every tool runs on the endpoint, whose host signs
 *   its writes.
 */
export async function discoverMcpTools(
  services: ServiceManager,
  log?: Logger,
  MCPClient?: any,
  bearer?: McpBearer,
  inProcess?: McpInProcessTools,
): Promise<Record<string, any>> {
  const instances = services.list();

  // Collect all api-mcp endpoint URLs from running services, tracking which service they belong to
  const activeEndpoints: McpEndpoint[] = [];
  for (const inst of instances) {
    if (inst.status !== "ready") continue;
    if (!inst.endpoints || !inst.endpointTypes) continue;
    for (const [name, type] of Object.entries(inst.endpointTypes)) {
      if (type === "api-mcp" && inst.endpoints[name]) {
        activeEndpoints.push({
          url: inst.endpoints[name]!,
          serviceId: inst.serviceId,
          instanceId: inst.instanceId,
          graphqlUrl: graphqlUrlOf(inst, inst.endpoints[name]!),
        });
      }
    }
  }

  // Build a map of active URL → instanceId for staleness checks
  const activeUrlInstances = new Map(
    activeEndpoints.map((ep) => [ep.url, ep.instanceId]),
  );

  // Disconnect stale clients: URL no longer active, or instance behind the URL changed
  for (const [url, entry] of clients) {
    const activeInstanceId = activeUrlInstances.get(url);
    if (!activeInstanceId || activeInstanceId !== entry.instanceId) {
      log?.debug(
        `[mcp-discover] Disconnecting stale client for ${url} (was: ${entry.instanceId}, now: ${activeInstanceId ?? "gone"})`,
      );
      try {
        await entry.client.disconnect();
      } catch {
        /* ignore */
      }
      clients.delete(url);
    }
  }

  if (activeEndpoints.length === 0) {
    log?.debug("[mcp-discover] No active MCP URLs found");
    return {};
  }

  // MCPClient must be provided by the consumer (resolved from their node_modules)
  if (!MCPClient && !inProcess) {
    throw new Error(
      "MCP endpoints found on running services but no MCPClient was provided to getTools(). " +
        "Pass { MCPClient } from @mastra/mcp, or set { includeMcp: false } to disable MCP discovery.",
    );
  }

  // Count endpoints per service to decide whether to include instance suffix
  const endpointsPerService = new Map<string, number>();
  for (const ep of activeEndpoints) {
    endpointsPerService.set(
      ep.serviceId,
      (endpointsPerService.get(ep.serviceId) ?? 0) + 1,
    );
  }

  const allTools: Record<string, any> = {};

  for (const ep of activeEndpoints) {
    // Determine prefix: serviceId-mcp, or serviceId-instanceSuffix-mcp for multi-instance
    const needsSuffix = (endpointsPerService.get(ep.serviceId) ?? 1) > 1;
    const instanceSuffix = ep.instanceId.includes(":")
      ? ep.instanceId.split(":")[1]
      : undefined;
    const prefix =
      needsSuffix && instanceSuffix
        ? `${ep.serviceId}-${instanceSuffix}-mcp`
        : `${ep.serviceId}-mcp`;

    let local: Record<string, any> | undefined;
    if (inProcess) {
      try {
        local = await inProcessReactorTools(ep, inProcess, bearer);
      } catch (err) {
        log?.warn(
          `[mcp-discover] The reactor tools for ${ep.url} could not run here: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
    for (const [toolName, tool] of Object.entries(local ?? {})) {
      allTools[`${prefix}__${toolName}`] = tool;
    }
    if (!MCPClient) continue;

    let entry = clients.get(ep.url);

    if (!entry) {
      // Use serviceId as the server key for clean tool naming
      const serverKey = ep.serviceId;
      log?.debug(
        `[mcp-discover] Connecting to ${ep.url} (service: ${ep.serviceId}, instance: ${ep.instanceId})`,
      );
      const client = new MCPClient({
        id: `ph-clint-mcp-${ep.serviceId}`,
        servers: {
          [serverKey]: {
            url: new URL(ep.url),
            ...(bearer
              ? {
                  fetch: fetchWithBearer(bearer, {
                    url: ep.url,
                    serviceId: ep.serviceId,
                  }),
                }
              : {}),
          },
        },
      });
      entry = { client, instanceId: ep.instanceId };
      clients.set(ep.url, entry);
    }

    try {
      const tools = await entry.client.listTools();
      log?.debug(
        `[mcp-discover] Got ${Object.keys(tools).length} tools from ${ep.url}`,
      );

      // Rename tools: strip the MCPClient's server key prefix, add our service prefix
      for (const [rawName, tool] of Object.entries(tools)) {
        // MCPClient prefixes tool names as `{serverKey}_{toolName}`
        const serverKey = ep.serviceId;
        const toolName = rawName.startsWith(`${serverKey}_`)
          ? rawName.slice(serverKey.length + 1)
          : rawName;
        // A tool that runs here is not the endpoint's to sign.
        if (local && toolName in local) continue;
        const prefixedName = `${prefix}__${toolName}`;
        allTools[prefixedName] = tool;
      }
    } catch (err) {
      log?.warn(
        `[mcp-discover] Tool discovery failed for ${ep.url}: ${err instanceof Error ? err.message : err}`,
      );
      // Evict so the next discovery reconnects fresh. The cached client's
      // session dies when the MCP server restarts inside a live service
      // instance (e.g. `ph dev --watch` reloading its switchboard), which
      // the instanceId staleness check above cannot see.
      try {
        await entry.client.disconnect();
      } catch {
        /* ignore */
      }
      clients.delete(ep.url);
    }
  }

  return allTools;
}

/**
 * Disconnect all cached MCP clients. Call during teardown.
 */
export async function disconnectAllMcp(): Promise<void> {
  for (const [url, entry] of clients) {
    try {
      await entry.client.disconnect();
    } catch {
      /* ignore */
    }
    clients.delete(url);
  }
}
