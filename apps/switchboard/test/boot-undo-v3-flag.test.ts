import type { ILogger } from "document-model";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SwitchboardConfigInput } from "../src/config/schema.js";
import type { startSwitchboard } from "../src/server.mjs";
import { bootSwitchboard } from "./boot-helpers.js";

type Switchboard = Awaited<ReturnType<typeof startSwitchboard>>;
type StubLogger = ILogger & { info: ReturnType<typeof vi.fn> };

const UNDO_V3_OFF = "Reactor undoV3 is off: new documents take base-reducer 2";
const ENV_KEYS = ["PH_REACTOR_DATABASE_URL", "REACTOR_UNDO_V3"] as const;

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

async function withSwitchboard(
  options: {
    env?: Partial<Record<(typeof ENV_KEYS)[number], string>>;
    protocol?: SwitchboardConfigInput["protocol"];
  },
  run: (switchboard: Switchboard, logger: StubLogger) => Promise<void>,
): Promise<void> {
  const tempRoot = await mkdtemp(join(tmpdir(), "switchboard-undo-v3-"));
  const previous = ENV_KEYS.map((name) => [name, process.env[name]] as const);
  for (const name of ENV_KEYS) delete process.env[name];
  process.env.PH_REACTOR_DATABASE_URL = join(tempRoot, "reactor-storage");
  Object.assign(process.env, options.env);
  const logger = stubLogger();
  let switchboard: Switchboard | undefined;

  try {
    switchboard = await bootSwitchboard(
      {
        server: { port: 0 },
        storage: { readModel: { url: join(tempRoot, "read-model") } },
        features: { workflows: false, mcp: false },
        packages: { disableLocal: true },
        identity: { keypairPath: join(tempRoot, "identity.json") },
        ...(options.protocol ? { protocol: options.protocol } : {}),
      },
      { logger },
    );
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

/** The base-reducer version a new document is stored with, read back. */
async function storedBaseReducer({ reactor }: Switchboard) {
  const created = await reactor.createEmpty("powerhouse/document-model");
  const stored = await reactor.get(created.header.id);
  return stored.header.protocolVersions?.["base-reducer"];
}

describe("booting Switchboard with undoV3", () => {
  it("leaves undoV3 to the reactor's default without a setting", async () => {
    await withSwitchboard({}, async (switchboard, logger) => {
      expect(logger.info).not.toHaveBeenCalledWith(UNDO_V3_OFF);
      expect(await storedBaseReducer(switchboard)).toBe(2);
    });
  }, 60_000);

  it.each<[string, Parameters<typeof withSwitchboard>[0]]>([
    ["REACTOR_UNDO_V3=false", { env: { REACTOR_UNDO_V3: "false" } }],
    [
      "protocol.featureFlags.undoV3 false",
      { protocol: { featureFlags: { undoV3: false } } },
    ],
  ])(
    "turns undoV3 off with %s and says so",
    async (_name, options) => {
      await withSwitchboard(options, async (switchboard, logger) => {
        expect(logger.info).toHaveBeenCalledWith(UNDO_V3_OFF);
        expect(await storedBaseReducer(switchboard)).toBe(2);
      });
    },
    60_000,
  );

  it.each<[string, Parameters<typeof withSwitchboard>[0]]>([
    ["REACTOR_UNDO_V3=true", { env: { REACTOR_UNDO_V3: "true" } }],
    [
      "protocol.featureFlags.undoV3 true",
      { protocol: { featureFlags: { undoV3: true } } },
    ],
  ])(
    "creates base-reducer 3 documents with %s",
    async (_name, options) => {
      await withSwitchboard(options, async (switchboard, logger) => {
        expect(logger.info).not.toHaveBeenCalledWith(UNDO_V3_OFF);
        expect(await storedBaseReducer(switchboard)).toBe(3);
      });
    },
    60_000,
  );
});
