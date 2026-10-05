import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ILogger } from "document-model";
import { describe, expect, it, vi } from "vitest";
import { startSwitchboard } from "../src/server.mjs";

function stubLogger(): ILogger & { info: ReturnType<typeof vi.fn> } {
  const logger = {
    verbose: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  logger.child.mockReturnValue(logger);
  return logger as unknown as ILogger & { info: ReturnType<typeof vi.fn> };
}

describe("booting Switchboard", () => {
  it("has no REQUIRE_SIGNATURES flag, and ignores the variable", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "switchboard-signatures-"));
    const previous = {
      reactorDb: process.env.PH_REACTOR_DATABASE_URL,
      requireSignatures: process.env.REQUIRE_SIGNATURES,
    };
    process.env.PH_REACTOR_DATABASE_URL = join(tempRoot, "reactor-storage");
    process.env.REQUIRE_SIGNATURES = "true";
    const logger = stubLogger();
    let switchboard: Awaited<ReturnType<typeof startSwitchboard>> | undefined;

    try {
      switchboard = await startSwitchboard({
        workflows: { enabled: false },
        dbPath: join(tempRoot, "read-model"),
        port: 0,
        mcp: false,
        disableLocalPackages: true,
        identity: { keypairPath: join(tempRoot, "identity.json") },
        logger,
      });

      const flagLog = logger.info.mock.calls.find(
        ([message]) => message === "Feature flags: @flags",
      );
      expect(flagLog).toBeDefined();
      expect(JSON.parse(flagLog![1] as string)).not.toHaveProperty(
        "REQUIRE_SIGNATURES",
      );

      const created = await switchboard.reactor.createEmpty(
        "powerhouse/document-model",
      );
      expect(created.header.id).toBeTruthy();

      await switchboard.shutdown();
      switchboard = undefined;
    } finally {
      await switchboard?.shutdown();
      for (const [name, value] of [
        ["PH_REACTOR_DATABASE_URL", previous.reactorDb],
        ["REQUIRE_SIGNATURES", previous.requireSignatures],
      ] as const) {
        if (value === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = value;
        }
      }
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60_000);
});
