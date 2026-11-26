import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ILogger } from "document-model";
import { describe, expect, it, vi } from "vitest";
import type { startSwitchboard } from "../src/server.mjs";
import { bootSwitchboard } from "./boot-helpers.js";

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

/**
 * A switchboard whose identity names its key file (`identity.keypairPath`)
 * keeps it there and writes no Renown user file, a named one included (it
 * signs as the instance, no user): nothing lands in the `.ph` of the working
 * directory, which is the project's when a package's switchboard runs in it.
 */
describe("booting Switchboard with its identity files named", () => {
  it("writes the keypair there, no Renown user file, and nothing under <cwd>/.ph", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "switchboard-identity-"));
    const cwd = join(tempRoot, "project");
    await mkdir(cwd);
    const identity = join(tempRoot, "studio", "switchboard");
    const previousCwd = process.cwd();
    const previousDb = process.env.PH_REACTOR_DATABASE_URL;
    process.env.PH_REACTOR_DATABASE_URL = join(tempRoot, "reactor-storage");
    process.chdir(cwd);
    let switchboard: Awaited<ReturnType<typeof startSwitchboard>> | undefined;
    try {
      switchboard = await bootSwitchboard(
        {
          server: { port: 0 },
          storage: { readModel: { url: join(tempRoot, "read-model") } },
          features: { workflows: false, mcp: false },
          packages: { disableLocal: true },
          identity: {
            keypairPath: join(identity, ".keypair.json"),
            storagePath: join(identity, ".renown.json"),
          },
        },
        { logger: stubLogger() },
      );
      expect(existsSync(join(identity, ".keypair.json"))).toBe(true);
      expect(existsSync(join(identity, ".renown.json"))).toBe(false);
      expect(switchboard.renown?.signer.user).toBeUndefined();
      expect(existsSync(join(cwd, ".ph"))).toBe(false);
      await switchboard.shutdown();
      switchboard = undefined;
      expect(existsSync(join(cwd, ".ph"))).toBe(false);
    } finally {
      await switchboard?.shutdown();
      process.chdir(previousCwd);
      if (previousDb === undefined) delete process.env.PH_REACTOR_DATABASE_URL;
      else process.env.PH_REACTOR_DATABASE_URL = previousDb;
      await rm(tempRoot, { recursive: true, force: true, maxRetries: 10 });
    }
  }, 60_000);
});
