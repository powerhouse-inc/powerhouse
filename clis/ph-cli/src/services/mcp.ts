import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  CallToolResultSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
  type CallToolRequest,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import type { IReactorClient } from "@powerhousedao/reactor";
import { createServer } from "@powerhousedao/reactor-mcp";
import { resolveSwitchboardPortDefault } from "@powerhousedao/shared/clis/args";
import fs from "node:fs";
import path from "node:path";
import { getVersion } from "../get-version.js";
import {
  currentPhCliVetraCommand,
  ensureVetra,
  restartVetra,
  VetraStartError,
  type EnsureVetraOptions,
  type VetraCommand,
} from "../utils/vetra-launch.js";
import {
  readVetraRuntime,
  type VetraRuntimeRecord,
} from "../utils/vetra-runtime.js";

const CALL_TIMEOUT_MS = 10 * 60_000;
const CONFIG_FILE = "powerhouse.config.json";

export type McpLauncherOptions = {
  projectDir?: string;
  startTimeoutSeconds: number;
  /** Test seam: what starts Vetra; defaults to this ph-cli's `vetra`. */
  vetraCommand?: VetraCommand;
};

/** The nearest directory at or above `start` holding powerhouse.config.json. */
export function findProjectDir(start: string): string | undefined {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, CONFIG_FILE))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

// The tool list never touches the reactor, so a client that throws on use is enough.
const reactorlessClient = new Proxy({} as IReactorClient, {
  get(_target, property) {
    if (property === "then") return undefined;
    return () => {
      throw new Error("reactor-mcp's local tool list has no reactor");
    };
  },
});

/** reactor-mcp's own server, in-process, for the tool list and resources. */
async function connectLocalReactorMcp(): Promise<Client> {
  const server = await createServer({ client: reactorlessClient });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "ph-mcp", version: getVersion() });
  await client.connect(clientSide);
  return client;
}

function toolError(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

/** The call never reached a live session: Vetra is down, or restarted since. */
function isStaleConnection(error: unknown): boolean {
  if (error instanceof StreamableHTTPError) {
    return error.code === 404 || error.code === 400;
  }
  for (let e = error; e instanceof Error; e = e.cause) {
    if ((e as NodeJS.ErrnoException).code === "ECONNREFUSED") return true;
  }
  return false;
}

export const RESTART_VETRA_TOOL = "restartVetra";

const restartVetraTool: Tool = {
  name: RESTART_VETRA_TOOL,
  description:
    "Restart this project's Vetra (its Switchboard and Studio) and wait until it is ready. " +
    "Use it after a change Vetra reads only at startup, such as the reactor or packages settings " +
    "in powerhouse.config.json; Studio restarts by itself for connect.* changes. " +
    "Returns the new Connect, Switchboard and MCP URLs.",
  inputSchema: { type: "object", properties: {} },
  outputSchema: {
    type: "object",
    properties: {
      pid: { type: "number" },
      connectUrl: { type: "string" },
      switchboardUrl: { type: "string" },
      mcpUrl: { type: "string" },
    },
    required: ["pid", "mcpUrl"],
  },
};

function vetraUrls(record: VetraRuntimeRecord) {
  return {
    pid: record.pid,
    ...(record.connectUrl ? { connectUrl: record.connectUrl } : {}),
    switchboardUrl:
      record.switchboardUrl ??
      `http://localhost:${record.switchboardPort}/graphql`,
    mcpUrl: record.mcpUrl || `http://localhost:${record.switchboardPort}/mcp`,
  };
}

function projectName(projectDir: string): string | undefined {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(projectDir, "package.json"), "utf8"),
    ) as { name?: string };
    return pkg.name;
  } catch {
    return undefined;
  }
}

/** Connects to the project's Vetra `/mcp`, starting Vetra when it is down. */
type Progress = (message: string) => void;

class Upstream {
  #client: Promise<Client> | undefined;
  /** The Vetra the client talks to; another pid in the record means it restarted. */
  #pid: number | undefined;
  /** The calls waiting on the connection, told how Vetra's start goes. */
  #waiting = new Set<Progress>();

  constructor(
    private readonly projectDir: string | undefined,
    private readonly options: McpLauncherOptions,
  ) {}

  get(onProgress?: Progress): Promise<Client> {
    if (this.#client && this.#pid !== undefined && this.projectDir) {
      const pid = readVetraRuntime(this.projectDir)?.pid;
      if (pid !== this.#pid) this.reset();
    }
    this.#client ??= this.#connect(ensureVetra).catch((error: unknown) => {
      this.#client = undefined;
      throw error;
    });
    return this.#waitWith(this.#client, onProgress);
  }

  async #waitWith<T>(task: Promise<T>, onProgress?: Progress): Promise<T> {
    if (onProgress) this.#waiting.add(onProgress);
    try {
      return await task;
    } finally {
      if (onProgress) this.#waiting.delete(onProgress);
    }
  }

  #report = (message: string) => {
    for (const progress of this.#waiting) progress(message);
  };

  reset(): void {
    const stale = this.#client;
    this.#client = undefined;
    this.#pid = undefined;
    void stale?.then((client) => client.close()).catch(() => {});
  }

  /** Restarts Vetra and connects to the new one; resolves to its record. */
  async restart(onProgress?: Progress): Promise<VetraRuntimeRecord> {
    this.reset();
    let record: VetraRuntimeRecord | undefined;
    const connected = this.#connect(async (options) => {
      record = await restartVetra(options);
      return record;
    });
    this.#client = connected.catch((error: unknown) => {
      this.#client = undefined;
      throw error;
    });
    await this.#waitWith(this.#client, onProgress);
    return record!;
  }

  async #connect(
    start: (options: EnsureVetraOptions) => Promise<VetraRuntimeRecord>,
  ): Promise<Client> {
    const { projectDir } = this;
    if (!projectDir) {
      throw new VetraStartError(
        `No Powerhouse project (${CONFIG_FILE}) at or above ${process.cwd()}. Run \`ph mcp\` inside the project, or pass --project-dir.`,
      );
    }
    const name = projectName(projectDir);
    if (!name) {
      throw new VetraStartError(`${projectDir} has no package.json name.`);
    }
    console.error(`[ph mcp] connecting to Vetra for ${name}...`);
    const record = await start({
      projectDir,
      projectName: name,
      switchboardPort: resolveSwitchboardPortDefault(),
      command: this.options.vetraCommand ?? currentPhCliVetraCommand(),
      timeoutMs: this.options.startTimeoutSeconds * 1000,
      onProgress: this.#report,
    });
    const { mcpUrl } = vetraUrls(record);
    const client = new Client({ name: "ph-mcp", version: getVersion() });
    await client.connect(new StreamableHTTPClientTransport(new URL(mcpUrl)));
    this.#pid = record.pid;
    console.error(`[ph mcp] forwarding tool calls to ${mcpUrl}`);
    return client;
  }
}

async function forwardToolCall(
  upstream: Upstream,
  params: CallToolRequest["params"],
  signal: AbortSignal,
  onProgress: Progress,
): Promise<CallToolResult> {
  for (let attempt = 0; ; attempt++) {
    const client = await upstream.get(onProgress);
    try {
      return await client.request(
        { method: "tools/call", params },
        CallToolResultSchema,
        { signal, timeout: CALL_TIMEOUT_MS },
      );
    } catch (error) {
      // It never arrived: Vetra went away or restarted, so find or start it again.
      if (attempt > 0 || !isStaleConnection(error)) throw error;
      upstream.reset();
    }
  }
}

/** `ph mcp`: tools listed by in-process reactor-mcp, calls forwarded to Vetra (started on first call). */
export async function startMcpLauncher(options: McpLauncherOptions) {
  // stdout carries JSON-RPC only.
  console.log = console.error;
  console.info = console.error;

  const projectDir = findProjectDir(
    options.projectDir ?? process.env.PH_CALLER_CWD ?? process.cwd(),
  );
  // Port resolution and `ph vetra` both read the project from the cwd.
  if (projectDir) process.chdir(projectDir);

  const local = await connectLocalReactorMcp();
  const upstream = new Upstream(projectDir, options);
  const server = new Server(
    local.getServerVersion() ?? { name: "reactor-mcp-server", version: "" },
    {
      capabilities: { tools: {}, resources: {} },
      instructions: local.getInstructions(),
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async (request) => {
    const listed = await local.listTools(request.params);
    return { ...listed, tools: [...listed.tools, restartVetraTool] };
  });
  server.setRequestHandler(ListResourcesRequestSchema, (request) =>
    local.listResources(request.params),
  );
  server.setRequestHandler(ListResourceTemplatesRequestSchema, (request) =>
    local.listResourceTemplates(request.params),
  );
  server.setRequestHandler(ReadResourceRequestSchema, (request) =>
    local.readResource(request.params),
  );
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    // How Vetra's start goes: progress notifications when the client asked, else stderr.
    const token = request.params._meta?.progressToken;
    let progress = 0;
    const onProgress: Progress = (message) => {
      if (token === undefined) {
        console.error(`[ph mcp] ${message}`);
        return;
      }
      void extra
        .sendNotification({
          method: "notifications/progress",
          params: { progressToken: token, progress: ++progress, message },
        })
        .catch(() => {});
    };
    try {
      if (request.params.name === RESTART_VETRA_TOOL) {
        const urls = vetraUrls(await upstream.restart(onProgress));
        return {
          content: [{ type: "text", text: JSON.stringify(urls) }],
          structuredContent: urls,
        };
      }
      return await forwardToolCall(
        upstream,
        request.params,
        extra.signal,
        onProgress,
      );
    } catch (error) {
      // Protocol errors from reactor-mcp reach the agent as they would over HTTP.
      if (error instanceof McpError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      return toolError(
        error instanceof VetraStartError
          ? message
          : `reactor-mcp request failed: ${message}`,
      );
    }
  });

  const transport = new StdioServerTransport();
  transport.onclose = () => process.exit(0);
  process.stdin.once("end", () => process.exit(0));
  await server.connect(transport);
}
