import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ILogger } from "document-model";
import { describe, expect, it, vi } from "vitest";
import { binSwitchboardConfig } from "../src/config/bin.js";
import { switchboardConfigFromEnv } from "../src/config/from-env.js";
import {
  callerOverEnv,
  switchboardConfigSchema,
  type SwitchboardConfig,
  type SwitchboardConfigInput,
} from "../src/config/schema.js";
import {
  builtinSwitchboardPlugins,
  defaultSwitchboardPlugins,
} from "../src/plugin-host.mjs";
import type { startSwitchboard } from "../src/server.mjs";
import { bootSwitchboard } from "./boot-helpers.js";

type Env = Record<string, string | undefined>;

const MCP = "switchboard-mcp";
const ATTACHMENTS = "switchboard-attachments";
const PRIVACY = "switchboard-privacy";
const WORKFLOWS = "switchboard-workflows";

const silent = { warn: () => undefined } as unknown as ILogger;

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

function resolved(env: Env, caller: SwitchboardConfigInput): SwitchboardConfig {
  return switchboardConfigSchema.parse(
    callerOverEnv(switchboardConfigFromEnv(env, { logger: silent }), caller),
  );
}

function names(switches: { mcp: boolean; workflows: boolean }): string[] {
  return defaultSwitchboardPlugins(switches).map((r) => r.plugin.name);
}

describe("defaultSwitchboardPlugins", () => {
  it.each([
    [true, true, [MCP, ATTACHMENTS, PRIVACY, WORKFLOWS]],
    [true, false, [MCP, ATTACHMENTS, PRIVACY]],
    [false, true, [ATTACHMENTS, PRIVACY, WORKFLOWS]],
    [false, false, [ATTACHMENTS, PRIVACY]],
  ])("mcp %s, workflows %s", (mcp, workflows, expected) => {
    expect(names({ mcp, workflows })).toEqual(expected);
  });

  it("is the built-in list, filtered: same entries, same order", () => {
    const builtin = builtinSwitchboardPlugins();
    expect(defaultSwitchboardPlugins({ mcp: true, workflows: true })).toEqual(
      builtin,
    );
    const neither = defaultSwitchboardPlugins({ mcp: false, workflows: false });
    expect(neither).toEqual(
      builtin.filter(
        (r) => r.plugin.name === ATTACHMENTS || r.plugin.name === PRIVACY,
      ),
    );
  });
});

describe("the retired plugin-host switch", () => {
  it("is no config key: the schema drops it", () => {
    expect(
      switchboardConfigSchema.parse({ features: { pluginHost: false } })
        .features,
    ).not.toHaveProperty("pluginHost");
  });

  it.each(["1", "true", "false", "0"])(
    "FEATURE_PLUGIN_HOST_ENABLED=%j changes nothing in the config",
    (value) => {
      expect(resolved({ FEATURE_PLUGIN_HOST_ENABLED: value }, {})).toEqual(
        resolved({}, {}),
      );
    },
  );
});

describe("the switches without a declared composition", () => {
  it("keeps an env true for MCP_ENABLED and PH_WORKFLOWS_ENABLED", () => {
    const config = resolved(
      { MCP_ENABLED: "true", PH_WORKFLOWS_ENABLED: "true" },
      {},
    );
    expect(config.features.mcp).toBe(true);
    expect(config.features.workflows).toBe(true);
  });

  it("lets an env false win over the caller's true", () => {
    const config = resolved(
      { MCP_ENABLED: "false", PH_WORKFLOWS_ENABLED: "false" },
      { features: { mcp: true, workflows: true } },
    );
    expect(config.features.mcp).toBe(false);
    expect(config.features.workflows).toBe(false);
  });

  it("MCP_ENABLED=false beats the bin's own features.mcp", () => {
    const config = switchboardConfigSchema.parse(
      binSwitchboardConfig(
        { MCP_ENABLED: "false" },
        { migratePglite: false, logger: silent },
      ),
    );
    expect(config.features.mcp).toBe(false);
  });

  it("the bin mounts MCP when the env says nothing", () => {
    const config = switchboardConfigSchema.parse(
      binSwitchboardConfig({}, { migratePglite: false, logger: silent }),
    );
    expect(config.features.mcp).toBe(true);
  });
});

const PLUGIN_LOG = "[switchboard:plugins]";

/** Boots with the env sandboxed like plugin-presence.test.ts, and hands back
 * the plugin host's console lines. */
async function withSwitchboard(
  env: Env,
  features: NonNullable<SwitchboardConfigInput["features"]>,
  run: (
    switchboard: Awaited<ReturnType<typeof startSwitchboard>>,
    pluginLines: string[],
  ) => Promise<void>,
): Promise<void> {
  const tempRoot = await mkdtemp(
    join(tmpdir(), "switchboard-default-composition-"),
  );
  const touched = [
    "PH_REACTOR_DATABASE_URL",
    "MCP_ENABLED",
    "PH_WORKFLOWS_ENABLED",
  ];
  const previous = touched.map((name) => [name, process.env[name]] as const);
  for (const name of touched) delete process.env[name];
  process.env.PH_REACTOR_DATABASE_URL = join(tempRoot, "reactor-storage");
  for (const [name, value] of Object.entries(env)) {
    if (value !== undefined) process.env[name] = value;
  }
  const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  let switchboard: Awaited<ReturnType<typeof startSwitchboard>> | undefined;

  try {
    switchboard = await bootSwitchboard(
      {
        server: { port: 0 },
        storage: { readModel: { url: join(tempRoot, "read-model") } },
        features: { workflows: false, ...features },
        packages: { disableLocal: true },
        identity: { keypairPath: join(tempRoot, "identity.json") },
        drive: {
          slug: "default-drive",
          global: { name: "Default Drive" },
        },
      },
      { logger: stubLogger() },
    );
    const pluginLines = log.mock.calls
      .map((call) => String(call[0]))
      .filter((line) => line.startsWith(PLUGIN_LOG));
    await run(switchboard, pluginLines);
    await switchboard.shutdown();
    switchboard = undefined;
  } finally {
    await switchboard?.shutdown();
    log.mockRestore();
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

describe("a boot without a declared composition", () => {
  it("runs the default composition through the plugin host", async () => {
    await withSwitchboard({}, {}, async (switchboard, pluginLines) => {
      expect(pluginLines[0]).toContain(
        `composition: 3 plugin(s) in order — ${MCP}, ${ATTACHMENTS}, ${PRIVACY}`,
      );
      expect(switchboard.mcpEnabled).toBe(true);
      expect(await postMcp(switchboard.port)).not.toBe(404);
      expect(switchboard.attachmentService).toBeDefined();
      expect(switchboard.workflowsEnabled).toBe(false);
    });
  }, 60_000);

  it("MCP_ENABLED=false leaves the mcp plugin out", async () => {
    await withSwitchboard(
      { MCP_ENABLED: "false" },
      { mcp: true },
      async (switchboard, pluginLines) => {
        expect(pluginLines[0]).toContain(
          `composition: 2 plugin(s) in order — ${ATTACHMENTS}, ${PRIVACY}`,
        );
        expect(switchboard.mcpEnabled).toBe(false);
        expect(await postMcp(switchboard.port)).toBe(404);
        expect(switchboard.attachmentService).toBeDefined();
      },
    );
  }, 60_000);
});
