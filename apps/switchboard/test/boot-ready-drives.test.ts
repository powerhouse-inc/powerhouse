import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ILogger } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { startSwitchboard, SwitchboardDeps } from "../src/server.mjs";
import { bootSwitchboard } from "./boot-helpers.js";

type Switchboard = Awaited<ReturnType<typeof startSwitchboard>>;

const SLUG = "ready-drive";

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
let running: Promise<Switchboard>[] = [];

beforeEach(() => {
  previousEnv = ENV.map((name) => [name, process.env[name]] as const);
  delete process.env.FEATURE_PLUGIN_HOST_ENABLED;
});

afterEach(async () => {
  for (const booting of running.reverse()) {
    await (await booting).shutdown();
  }
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

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, () => {
      const address = server.address();
      server.close(() =>
        typeof address === "object" && address
          ? resolve(address.port)
          : reject(new Error("no port")),
      );
    });
  });
}

/** Starts a boot without awaiting it, so `/ready` can be watched coming up. */
async function startBoot(deps: SwitchboardDeps = {}) {
  const tempRoot = await mkdtemp(join(tmpdir(), "switchboard-ready-"));
  tempRoots.push(tempRoot);
  process.env.PH_REACTOR_DATABASE_URL = join(tempRoot, "reactor-storage");
  const port = await freePort();
  const booting = bootSwitchboard(
    {
      server: { port, strictPort: true },
      storage: { readModel: { url: join(tempRoot, "read-model") } },
      features: { workflows: false, mcp: false },
      packages: { disableLocal: true },
      identity: { keypairPath: join(tempRoot, "identity.json") },
      drive: { slug: SLUG, global: { name: "Ready Drive" } },
    },
    { logger: stubLogger(), ...deps },
  );
  running.push(booting);
  return { origin: `http://localhost:${port}`, booting };
}

async function readyStatus(origin: string): Promise<number | undefined> {
  try {
    return (await fetch(`${origin}/ready`)).status;
  } catch {
    return undefined;
  }
}

async function untilReady(origin: string, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await readyStatus(origin)) === 200) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`${origin}/ready never turned 200`);
}

describe("switchboard readiness", () => {
  it("serves the default drive once /ready is 200", async () => {
    const { origin, booting } = await startBoot();

    await untilReady(origin);
    const drive = await fetch(`${origin}/d/${SLUG}`);

    expect(drive.status).toBe(200);
    await booting;
  }, 60_000);

  it("waits for the drives a caller seeds after start", async () => {
    let seeded!: () => void;
    const readyAfter = new Promise<void>((resolve) => {
      seeded = resolve;
    });
    const { origin, booting } = await startBoot({ readyAfter });
    await booting;

    // Long past the point an unheld boot turns ready.
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    expect(await readyStatus(origin)).toBe(503);

    seeded();
    await untilReady(origin, 10_000);
  }, 60_000);

  it("stays not ready when that seeding fails", async () => {
    const readyAfter = Promise.reject(new Error("seeding failed"));
    readyAfter.catch(() => undefined);
    const { origin, booting } = await startBoot({ readyAfter });
    await booting;

    await new Promise((resolve) => setTimeout(resolve, 2_000));
    expect(await readyStatus(origin)).toBe(503);
  }, 60_000);
});
