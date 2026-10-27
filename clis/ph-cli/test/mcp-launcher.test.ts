import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  ReactorBuilder,
  ReactorClientBuilder,
  type InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import { setupMcpServer } from "@powerhousedao/reactor-mcp";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  withSignaturePolicy,
  type DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import { mkdtempSync, writeFileSync } from "node:fs";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { writeVetraRuntime } from "../src/utils/vetra-runtime.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PH_CLI = path.resolve(here, "../dist/cli.mjs");
const PROJECT_NAME = "mcp-launcher-test";
const SEEDED_DRIVE = "launcher-drive";

type Handler = (
  req: IncomingMessage,
  res: ServerResponse,
  body?: unknown,
) => void | Promise<void>;

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function freePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as net.AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

function makeProject(port: number): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ph-mcp-"));
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: PROJECT_NAME, private: true }),
  );
  writeFileSync(
    path.join(dir, "powerhouse.config.json"),
    JSON.stringify({ reactor: { port } }),
  );
  return dir;
}

/** A real reactor behind reactor-mcp's own `/mcp` routes, as Vetra serves them. */
async function startReactorMcpHttp(port: number) {
  const module: InProcessReactorClientModule = await new ReactorClientBuilder()
    .withReactorBuilder(
      new ReactorBuilder().withDocumentModelSources([
        driveDocumentModelModule as unknown as DocumentModelModule,
      ]),
    )
    .buildModule();
  // A fixed id cannot be content-addressed, so the drive is legacy.
  await module.client.create(
    withSignaturePolicy(
      driveDocumentModelModule.utils.createDocument(),
      "legacy",
      {
        id: SEEDED_DRIVE,
      },
    ),
  );
  const routes = new Map<string, Handler>();
  await setupMcpServer(
    {
      client: module.client,
      authorizeRequest: () =>
        Promise.resolve({ authorized: true, subject: {} }),
    },
    {
      mountNodeRoute: (method, route, handler) =>
        routes.set(`${method} ${route}`, handler),
    },
  );
  const server = http.createServer((req, res) => {
    if (req.url === "/ready") return void res.end("OK");
    const handler = routes.get(`${req.method} ${req.url}`);
    if (!handler) return void res.writeHead(404).end();
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString();
      void handler(req, res, raw ? JSON.parse(raw) : undefined);
    });
  });
  await new Promise<void>((resolve) => server.listen(port, resolve));
  cleanups.push(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    module.reactor.kill();
  });
  return `http://localhost:${port}/mcp`;
}

async function connectLauncher(projectDir: string): Promise<Client> {
  const env = { ...process.env } as Record<string, string>;
  delete env.PH_CALLER_CWD;
  const client = new Client({ name: "test-agent", version: "1.0.0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [PH_CLI, "mcp", "--start-timeout", "5"],
      cwd: projectDir,
      env: { ...env, PH_NO_TELEMETRY: "1" },
      stderr: "ignore",
    }),
  );
  cleanups.push(() => client.close());
  return client;
}

async function connectHttp(url: string): Promise<Client> {
  const client = new Client({ name: "test-http", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  cleanups.push(() => client.close());
  return client;
}

// Each test boots ph-cli and two reactors: over 5s on a Windows runner.
describe("ph mcp", { timeout: 60_000 }, () => {
  it("lists reactor-mcp's tools before Vetra runs, then forwards calls to it", async () => {
    const port = await freePort();
    const projectDir = makeProject(port);

    const launcher = await connectLauncher(projectDir);
    const listed = await launcher.listTools();
    const names = listed.tools.map((tool) => tool.name);
    expect(names).toContain("addDrive");
    expect(names).toContain("restartVetra");

    const url = await startReactorMcpHttp(port);
    writeVetraRuntime(projectDir, {
      pid: process.pid,
      projectName: PROJECT_NAME,
      switchboardPort: port,
      connectPort: 0,
      mcpUrl: url,
      startedAt: new Date().toISOString(),
    });

    const direct = await connectHttp(url);
    // Vetra's own tools, plus the launcher's restartVetra.
    expect(listed.tools.filter((tool) => tool.name !== "restartVetra")).toEqual(
      (await direct.listTools()).tools,
    );

    const drives = await launcher.callTool({
      name: "getDrives",
      arguments: {},
    });
    expect(drives.isError).toBeFalsy();
    expect(drives.structuredContent).toEqual({ driveIds: [SEEDED_DRIVE] });
    expect(drives).toEqual(
      await direct.callTool({ name: "getDrives", arguments: {} }),
    );
  });

  it("returns a tool error instead of starting a reactor beside another project's", async () => {
    const port = await freePort();
    const projectDir = makeProject(port);
    await startReactorMcpHttp(port);
    writeVetraRuntime(projectDir, {
      pid: process.pid,
      projectName: "some-other-project",
      switchboardPort: port,
      connectPort: 0,
      mcpUrl: `http://localhost:${port}/mcp`,
      startedAt: new Date().toISOString(),
    });

    const launcher = await connectLauncher(projectDir);
    const result = await launcher.callTool({
      name: "getDrives",
      arguments: {},
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain(
      'live Vetra for \\"some-other-project\\"',
    );
  });
});
