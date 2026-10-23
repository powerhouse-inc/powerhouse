import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ILogger } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startSwitchboard } from "../src/server.mjs";

type Switchboard = Awaited<ReturnType<typeof startSwitchboard>>;

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

const ENV = ["PH_REACTOR_DATABASE_URL", "FEATURE_PLUGIN_HOST_ENABLED"];
let previousEnv: (readonly [string, string | undefined])[] = [];
let tempRoots: string[] = [];
let running: Switchboard[] = [];

beforeEach(() => {
  previousEnv = ENV.map((name) => [name, process.env[name]] as const);
  delete process.env.FEATURE_PLUGIN_HOST_ENABLED;
});

afterEach(async () => {
  for (const switchboard of running.reverse()) await switchboard.shutdown();
  running = [];
  for (const [name, value] of previousEnv) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  for (const root of tempRoots) {
    await rm(root, { recursive: true, force: true });
  }
  tempRoots = [];
});

// The reactor database comes from process env, so instances boot one at a time.
async function boot(): Promise<Switchboard> {
  const tempRoot = await mkdtemp(join(tmpdir(), "switchboard-port-zero-"));
  tempRoots.push(tempRoot);
  process.env.PH_REACTOR_DATABASE_URL = join(tempRoot, "reactor-storage");
  const switchboard = await startSwitchboard({
    workflows: { enabled: false },
    dbPath: join(tempRoot, "read-model"),
    port: 0,
    mcp: false,
    disableLocalPackages: true,
    identity: { keypairPath: join(tempRoot, "identity.json") },
    drive: {
      slug: "default-drive",
      global: { name: "Default Drive" },
    },
    logger: stubLogger(),
  });
  running.push(switchboard);
  return switchboard;
}

describe("booting Switchboard on port 0", () => {
  it("reports the port the OS picked", async () => {
    const { port, defaultDriveUrl } = await boot();

    expect(port).toBeGreaterThan(0);
    expect((await fetch(`http://localhost:${port}/health`)).status).toBe(200);
    const graphql = await fetch(`http://localhost:${port}/graphql`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "{ __typename }" }),
    });
    expect(graphql.status).toBe(200);
    expect(defaultDriveUrl).toBe(`http://localhost:${port}/d/default-drive`);
  }, 60_000);

  it("gives a second instance its own port while the first runs", async () => {
    const first = await boot();
    const second = await boot();

    expect(second.port).toBeGreaterThan(0);
    expect(second.port).not.toBe(first.port);
    expect((await fetch(`http://localhost:${first.port}/health`)).status).toBe(
      200,
    );
    expect((await fetch(`http://localhost:${second.port}/health`)).status).toBe(
      200,
    );
  }, 120_000);
});
