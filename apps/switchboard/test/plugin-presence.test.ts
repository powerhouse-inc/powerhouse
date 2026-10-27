import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HostPlugin, ResolvedPlugin } from "@powerhousedao/host-core";
import type { ILogger } from "document-model";
import { describe, expect, it, vi } from "vitest";
import {
  builtinSwitchboardPlugins,
  createSwitchboardPluginHost,
} from "../src/plugin-host.mjs";
import type { SwitchboardConfigInput } from "../src/config/schema.js";
import type { startSwitchboard, SwitchboardDeps } from "../src/server.mjs";
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
 * Boots with FEATURE_PLUGIN_HOST_ENABLED=1, sandboxing the env exactly like
 * boot-mcp-enabled.test.ts: temp PH_REACTOR_DATABASE_URL, MCP_ENABLED cleared
 * so it never leaks into the plugin-host composition under test, and every
 * touched env var restored in `finally`. Workflows stay off by default here
 * — case 5 below covers workflow presence on its own, lighter path.
 */
async function withPluginHostSwitchboard(
  override: { config?: SwitchboardConfigInput; deps?: SwitchboardDeps },
  run: (
    switchboard: Awaited<ReturnType<typeof startSwitchboard>>,
  ) => Promise<void>,
): Promise<void> {
  const tempRoot = await mkdtemp(
    join(tmpdir(), "switchboard-plugin-presence-"),
  );
  const names = [
    "PH_REACTOR_DATABASE_URL",
    "MCP_ENABLED",
    "FEATURE_PLUGIN_HOST_ENABLED",
  ];
  const previous = names.map((name) => [name, process.env[name]] as const);
  process.env.PH_REACTOR_DATABASE_URL = join(tempRoot, "reactor-storage");
  delete process.env.MCP_ENABLED;
  process.env.FEATURE_PLUGIN_HOST_ENABLED = "1";
  let switchboard: Awaited<ReturnType<typeof startSwitchboard>> | undefined;

  try {
    switchboard = await bootSwitchboard(
      {
        server: { port: 0 },
        storage: { readModel: { url: join(tempRoot, "read-model") } },
        features: { workflows: false, ...override.config?.features },
        packages: { disableLocal: true },
        identity: { keypairPath: join(tempRoot, "identity.json") },
        drive: {
          slug: "default-drive",
          global: { name: "Default Drive" },
        },
      },
      { logger: stubLogger(), ...override.deps },
    );
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

async function getReservation(port: number): Promise<number> {
  const response = await fetch(
    `http://127.0.0.1:${port}/attachments/reservations/does-not-matter`,
  );
  await response.body?.cancel();
  return response.status;
}

describe("plugin-host composition presence (FEATURE_PLUGIN_HOST_ENABLED)", () => {
  it("DEFAULT composition: mcp mounted, attachments present", async () => {
    await withPluginHostSwitchboard({}, async (switchboard) => {
      expect(switchboard.mcpEnabled).toBe(true);
      expect(await postMcp(switchboard.port)).not.toBe(404);
      expect(switchboard.attachmentService).toBeDefined();
    });
  }, 60_000);

  it("EMPTY composition ([]): attachments absent", async () => {
    await withPluginHostSwitchboard(
      { deps: { pluginComposition: [] } },
      async (switchboard) => {
        expect(switchboard.attachmentService).toBeUndefined();
        expect(await getReservation(switchboard.port)).toBe(404);
      },
    );
  }, 60_000);

  // Presence is activation (R2.6c fix): flag-on, startSwitchboard skips the
  // classic mcp/workflows resolvers and initServer normalizes unset values to
  // OFF after transformServerOptions — an absent plugin actually deactivates
  // its subsystem.
  it("EMPTY composition ([]): /mcp does not mount — presence is activation", async () => {
    await withPluginHostSwitchboard(
      { deps: { pluginComposition: [] } },
      async (switchboard) => {
        expect(switchboard.mcpEnabled).toBe(false);
        expect(await postMcp(switchboard.port)).toBe(404);
      },
    );
  }, 60_000);

  it("SUBSET composition (mcp only): mcp mounted, attachments absent", async () => {
    const mcpOnly = builtinSwitchboardPlugins().filter((resolved) =>
      resolved.entry.module.includes("/plugins/mcp"),
    );
    expect(mcpOnly).toHaveLength(1);
    await withPluginHostSwitchboard(
      { deps: { pluginComposition: mcpOnly } },
      async (switchboard) => {
        expect(switchboard.mcpEnabled).toBe(true);
        expect(await postMcp(switchboard.port)).not.toBe(404);
        expect(switchboard.attachmentService).toBeUndefined();
        expect(await getReservation(switchboard.port)).toBe(404);
      },
    );
  }, 60_000);

  it("an explicit mcp: false option still wins over the default composition", async () => {
    await withPluginHostSwitchboard(
      { config: { features: { mcp: false } } },
      async (switchboard) => {
        expect(switchboard.mcpEnabled).toBe(false);
        expect(await postMcp(switchboard.port)).toBe(404);
      },
    );
  }, 60_000);
});

describe("plugin-host workflows presence (transformServerOptions)", () => {
  // A real boot's workflows.enabled is resolved classically (env/config,
  // default OFF) in startSwitchboard BEFORE the plugin host is even
  // constructed (server.mts resolveWorkflowsEnabled ~line 1545, pluginHost
  // gate at ~line 407) — by the time the workflows plugin's
  // transformServerOptions hook runs, options.workflows.enabled is already a
  // definite boolean, so its "unless explicit false" short-circuit can never
  // observe an "unset" value through that path. Exercising the hook directly
  // against createSwitchboardPluginHost, as suggested as a fallback, is the
  // only way to observe the plugin's own force-true behavior in isolation —
  // see the suspected-bug note in the final report.
  it("forces workflows.enabled true when the plugin is present, leaves it alone when absent", async () => {
    const withWorkflowsPlugin = createSwitchboardPluginHost(
      { logger: stubLogger(), options: {}, renown: null },
      builtinSwitchboardPlugins(),
    );
    const resolvedWith = await withWorkflowsPlugin.transformOptions<
      Record<string, unknown>
    >({});
    expect(
      (resolvedWith.workflows as { enabled?: boolean } | undefined)?.enabled,
    ).toBe(true);

    const withoutAnyPlugin = createSwitchboardPluginHost(
      { logger: stubLogger(), options: {}, renown: null },
      [],
    );
    const resolvedWithout = await withoutAnyPlugin.transformOptions<
      Record<string, unknown>
    >({});
    expect(resolvedWithout.workflows).toBeUndefined();
  });

  it("still honors an explicit workflows.enabled: false even with the plugin present", async () => {
    const host = createSwitchboardPluginHost(
      { logger: stubLogger(), options: {}, renown: null },
      builtinSwitchboardPlugins(),
    );
    const resolved = await host.transformOptions<Record<string, unknown>>({
      workflows: { enabled: false },
    });
    expect(
      (resolved.workflows as { enabled?: boolean } | undefined)?.enabled,
    ).toBe(false);
  });
});

describe("plugin-host onShutdown ordering (runObserveHookSequential)", () => {
  it("runs onShutdown sequentially, in registration order — not by whichever finishes first", async () => {
    const order: string[] = [];

    function fakePlugin(name: string, delayMs: number): HostPlugin {
      return {
        name,
        appliesTo: "switchboard",
        hooks: {
          onShutdown: async () => {
            if (delayMs > 0) {
              await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
            order.push(name);
          },
        },
      };
    }

    function resolvedFake(plugin: HostPlugin): ResolvedPlugin {
      return {
        plugin,
        provenance: "local",
        entry: {
          module: `fake:${plugin.name}`,
          enabled: true,
          verbs: "*",
          config: {},
        },
      };
    }

    // Registered first but slower: if onShutdown ran in parallel (the way
    // the other hook moments do, via Promise.all in runObserveHook), "b"
    // would resolve first and the recorded order would be ["b", "a"].
    // Sequential execution must still record registration order, ["a", "b"].
    const first = fakePlugin("a", 50);
    const second = fakePlugin("b", 0);

    const host = createSwitchboardPluginHost(
      { logger: stubLogger(), options: {}, renown: null },
      [resolvedFake(first), resolvedFake(second)],
    );

    await host.observe("onShutdown");

    expect(order).toEqual(["a", "b"]);
  });
});
