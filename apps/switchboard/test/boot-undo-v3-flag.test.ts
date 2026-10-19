import type { ILogger } from "document-model";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { startSwitchboard } from "../src/server.mjs";

type StubLogger = ILogger & { info: ReturnType<typeof vi.fn> };

function stubLogger(): StubLogger {
  const logger = {
    verbose: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  logger.child.mockReturnValue(logger);
  return logger as unknown as StubLogger;
}

const ENV_KEYS = [
  "PH_REACTOR_DATABASE_URL",
  "REACTOR_UNDO_V3",
  "REACTOR_DOCUMENT_DECISIONS",
  "REACTOR_AUTH_ENFORCEMENT",
  "REACTOR_AUTH_GROUPS",
  "REACTOR_AUTH_CONDITIONS",
] as const;

async function withSwitchboard(
  env: Partial<Record<(typeof ENV_KEYS)[number], string>>,
  run: (
    switchboard: Awaited<ReturnType<typeof startSwitchboard>>,
    logger: StubLogger,
  ) => Promise<void>,
): Promise<void> {
  const tempRoot = await mkdtemp(join(tmpdir(), "switchboard-undo-v3-"));
  const previous = ENV_KEYS.map((name) => [name, process.env[name]] as const);
  for (const name of ENV_KEYS) delete process.env[name];
  process.env.PH_REACTOR_DATABASE_URL = join(tempRoot, "reactor-storage");
  Object.assign(process.env, env);
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
    await run(switchboard, logger);
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

describe("booting Switchboard with REACTOR_UNDO_V3", () => {
  it("turns undoV3 off when it is the only flag set", async () => {
    await withSwitchboard(
      { REACTOR_UNDO_V3: "false" },
      async ({ reactor }, logger) => {
        expect(logger.info).toHaveBeenCalledWith(
          expect.stringContaining("undoV3 is off"),
        );
        expect(
          await reactor.getCreateProtocolVersions({
            documentType: "powerhouse/document-model",
          }),
        ).toEqual({
          "base-reducer": 2,
        });
        const document = await reactor.createEmpty("powerhouse/document-model");
        expect(document.header.protocolVersions?.["base-reducer"]).toBe(2);
      },
    );
  }, 60_000);

  it("leaves undoV3 on by default", async () => {
    await withSwitchboard({}, async ({ reactor }, logger) => {
      expect(logger.info).not.toHaveBeenCalledWith(
        expect.stringContaining("undoV3 is off"),
      );
      expect(
        await reactor.getCreateProtocolVersions({
          documentType: "powerhouse/document-model",
        }),
      ).toEqual({
        "base-reducer": 3,
      });
    });
  }, 60_000);
});
