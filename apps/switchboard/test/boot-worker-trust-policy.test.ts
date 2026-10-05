import type { ILogger } from "document-model";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as RenownModule from "../src/renown.js";
import { startSwitchboard } from "../src/server.mjs";

vi.mock("../src/renown.js", async (importOriginal) => ({
  ...(await importOriginal<typeof RenownModule>()),
  initRenown: vi.fn().mockRejectedValue(new Error("Renown is unreachable")),
}));

const TRUST_FAILURE =
  /REACTOR_WORKERS[\s\S]*REACTOR_AUTH_ENFORCEMENT[\s\S]*RENOWN_SOURCE/;
const ENV_KEYS = [
  "PH_REACTOR_DATABASE_URL",
  "RENOWN_SOURCE",
  "REACTOR_DOCUMENT_DECISIONS",
  "REACTOR_AUTH_ENFORCEMENT",
] as const;

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

describe("booting with pooled workers under authEnforcement", () => {
  let tempRoot: string;
  let previous: Partial<Record<(typeof ENV_KEYS)[number], string>>;

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "switchboard-worker-trust-"));
    previous = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    process.env.PH_REACTOR_DATABASE_URL = join(tempRoot, "reactor-storage");
    process.env.REACTOR_DOCUMENT_DECISIONS = "true";
    process.env.REACTOR_AUTH_ENFORCEMENT = "true";
  });

  afterEach(async () => {
    for (const key of ENV_KEYS) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
    await rm(tempRoot, { recursive: true, force: true });
  });

  function boot(numWorkers: number) {
    return startSwitchboard({
      workflows: { enabled: false },
      dbPath: join(tempRoot, "read-model"),
      port: 0,
      mcp: false,
      disableLocalPackages: true,
      logger: stubLogger(),
      workerPool: { numWorkers },
    });
  }

  it("fails with a self Renown source", async () => {
    process.env.RENOWN_SOURCE = "self";

    await expect(boot(2)).rejects.toThrow(TRUST_FAILURE);
  });

  // Postgres is the next requirement a pooled boot has; reaching it passes the check.
  it("passes the check with a remote Renown source", async () => {
    process.env.RENOWN_SOURCE = "remote";

    await expect(boot(2)).rejects.toThrow(/requires a Postgres/);
  });

  // No loaded package serves the renown read model here; reaching that check passes this one.
  it("passes the check without workers", async () => {
    process.env.RENOWN_SOURCE = "self";

    await expect(boot(0)).rejects.toThrow(/no loaded package serves/);
  }, 60_000);
});
