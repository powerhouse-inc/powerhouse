import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ILogger } from "document-model";
import { describe, expect, it, vi } from "vitest";
import { startSwitchboard } from "../src/server.mjs";

// `port: 0` would bind a random port the switchboard does not report back, so
// the test picks a free one and pins it.
async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (!address || typeof address === "string") throw new Error("no port");
  return address.port;
}

function stubLogger(): ILogger {
  const logger = {
    verbose: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  logger.child.mockReturnValue(logger);
  return logger as unknown as ILogger;
}

async function withSwitchboard(
  env: Record<string, string>,
  mcp: boolean | undefined,
  run: (
    switchboard: Awaited<ReturnType<typeof startSwitchboard>>,
  ) => Promise<void>,
): Promise<void> {
  const tempRoot = await mkdtemp(join(tmpdir(), "switchboard-mcp-enabled-"));
  const names = ["PH_REACTOR_DATABASE_URL", "MCP_ENABLED", ...Object.keys(env)];
  const previous = names.map((name) => [name, process.env[name]] as const);
  process.env.PH_REACTOR_DATABASE_URL = join(tempRoot, "reactor-storage");
  delete process.env.MCP_ENABLED;
  Object.assign(process.env, env);
  let switchboard: Awaited<ReturnType<typeof startSwitchboard>> | undefined;

  try {
    switchboard = await startSwitchboard({
      workflows: { enabled: false },
      dbPath: join(tempRoot, "read-model"),
      port: await freePort(),
      strictPort: true,
      mcp,
      disableLocalPackages: true,
      identity: { keypairPath: join(tempRoot, "identity.json") },
      drive: {
        slug: "default-drive",
        global: { name: "Default Drive" },
      },
      logger: stubLogger(),
    });
    await run(switchboard);
    await switchboard.shutdown();
    switchboard = undefined;
  } finally {
    await switchboard?.shutdown();
    for (const [name, value] of previous) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function postMcp(port: number): Promise<number> {
  const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
  });
  await response.body?.cancel();
  return response.status;
}

describe("booting Switchboard", () => {
  it("mounts /mcp by default", async () => {
    await withSwitchboard({}, undefined, async ({ mcpEnabled, port }) => {
      expect(mcpEnabled).toBe(true);
      expect(await postMcp(port)).not.toBe(404);
    });
  }, 60_000);

  it('leaves /mcp unmounted under MCP_ENABLED="false"', async () => {
    await withSwitchboard(
      { MCP_ENABLED: "false" },
      undefined,
      async ({ mcpEnabled, port }) => {
        expect(mcpEnabled).toBe(false);
        expect(await postMcp(port)).toBe(404);
      },
    );
  }, 60_000);

  it("keeps a host's mcp: false over MCP_ENABLED=true", async () => {
    await withSwitchboard(
      { MCP_ENABLED: "true" },
      false,
      async ({ mcpEnabled, port }) => {
        expect(mcpEnabled).toBe(false);
        expect(await postMcp(port)).toBe(404);
      },
    );
  }, 60_000);
});
