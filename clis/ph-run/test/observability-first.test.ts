import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { RunnerContext } from "@powerhousedao/host-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SwitchboardHandle } from "../src/runners/switchboard.js";

// `ph run switchboard` with the real start-run, runner and service. The
// server and the observability module are fakes that record when they load
// and what is called on them.

const state = vi.hoisted(() => ({
  // Module loads and calls, in the order they happen.
  order: [] as string[],
  bootError: undefined as Error | undefined,
  reported: [] as unknown[],
  signalInstalls: 0,
}));

// Registered before each test (doMock): a vi.mock factory runs once per file,
// so only the first test would see the modules load.
const mockObservability = () => {
  state.order.push("observability loaded");
  return {
    meterProvider: undefined,
    sdk: undefined,
    flushObservability: () => {
      state.order.push("flush");
      return Promise.resolve();
    },
    installObservabilitySignals: () => {
      state.signalInstalls += 1;
    },
    reportBootFailure: (error: unknown) => {
      state.reported.push(error);
      return Promise.resolve();
    },
  };
};

const mockServer = () => {
  state.order.push("server loaded");
  return {
    initSwitchboardProcess: () => undefined,
    startSwitchboard: () => {
      if (state.bootError) return Promise.reject(state.bootError);
      return Promise.resolve({
        port: 4999,
        reactor: { resolveIdOrSlug: () => Promise.resolve("powerhouse") },
        defaultDriveUrl: "http://localhost:4999/d/powerhouse",
        workflowsEnabled: false,
        mcpEnabled: false,
        shutdown: () => {
          state.order.push("server shutdown");
          return Promise.resolve();
        },
      });
    },
  };
};

const SWITCHBOARD_SRC = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/runners/switchboard.ts",
);

const DESTINATION_ENV = [
  "SENTRY_DSN",
  "TEMPO_ENDPOINT",
  "OTEL_EXPORTER_OTLP_ENDPOINT",
];

function switchboardHost(root: string) {
  return {
    name: "switchboard",
    runner: { module: SWITCHBOARD_SRC, port: 0 },
    reactor: {
      backends: {
        main: {
          kind: "in-process",
          storage: { kind: "path", dataDir: path.join(root, "reactor") },
          readModel: { url: path.join(root, "read-model") },
        },
      },
    },
    config: {
      switchboard: {
        storage: { userDataDir: path.join(root, "user") },
        packages: { disableLocal: true },
        features: { workflows: false },
      },
    },
  };
}

function makeProject(): string {
  const root = mkdtempSync(path.join(tmpdir(), "ph-observability-first-"));
  writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "lab", type: "module" }),
  );
  writeFileSync(path.join(root, "powerhouse.config.json"), "{}");
  mkdirSync(path.join(root, "hosts", "switchboard"), { recursive: true });
  writeFileSync(
    path.join(root, "hosts", "switchboard", "host.js"),
    `export default ${JSON.stringify(switchboardHost(root))};`,
  );
  return root;
}

describe("observability on the `ph run switchboard` path", () => {
  let root: string;
  let exitListeners: Set<unknown>;

  const startRun = async () => {
    const { startRun: start } =
      await import("../src/services/run/start-run.js");
    return (await start({
      host: "switchboard",
      projectRoot: root,
    })) as SwitchboardHandle;
  };

  beforeEach(() => {
    // Fresh modules, so each test sees what its own run loads.
    vi.resetModules();
    vi.doMock("@powerhousedao/switchboard/observability", mockObservability);
    vi.doMock("@powerhousedao/switchboard/server", mockServer);
    root = makeProject();
    state.order = [];
    state.bootError = undefined;
    state.reported = [];
    state.signalInstalls = 0;
    exitListeners = new Set(process.listeners("exit"));
    for (const name of DESTINATION_ENV) vi.stubEnv(name, "");
    // The runner's readiness probe of the drive URL.
    vi.stubGlobal("fetch", () =>
      Promise.resolve(new Response(null, { status: 200 })),
    );
  });

  afterEach(() => {
    vi.doUnmock("@powerhousedao/switchboard/observability");
    vi.doUnmock("@powerhousedao/switchboard/server");
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    // start-run clears the run record on exit.
    for (const listener of process.listeners("exit")) {
      if (!exitListeners.has(listener)) {
        process.removeListener("exit", listener);
      }
    }
    rmSync(root, { recursive: true, force: true, maxRetries: 5 });
  });

  it("loads observability before the server when the env configures it", async () => {
    vi.stubEnv("SENTRY_DSN", "https://key@sentry.invalid/1");

    const handle = await startRun();

    expect(state.order).toEqual(["observability loaded", "server loaded"]);
    // Standalone: nothing else owns the signals.
    expect(state.signalInstalls).toBe(1);
    await handle.shutdown();
  }, 60_000);

  it.each(["TEMPO_ENDPOINT", "OTEL_EXPORTER_OTLP_ENDPOINT"])(
    "loads observability for %s",
    async (name) => {
      vi.stubEnv(name, "http://collector.invalid:4318");

      const handle = await startRun();

      expect(state.order[0]).toBe("observability loaded");
      await handle.shutdown();
    },
    60_000,
  );

  it("does not load observability when the env configures none", async () => {
    const handle = await startRun();
    await handle.shutdown();

    expect(state.order).toEqual(["server loaded", "server shutdown"]);
    expect(state.signalInstalls).toBe(0);
  }, 60_000);

  it("does not load observability for a one-shot verb", async () => {
    vi.stubEnv("SENTRY_DSN", "https://key@sentry.invalid/1");
    const { startRun: start } =
      await import("../src/services/run/start-run.js");

    // ph-run's switchboard runner has no `build`: the run ends at the verb.
    await expect(
      start({ host: "switchboard", verb: "build", projectRoot: root }),
    ).rejects.toThrow(/does not support the verb/);

    expect(state.order).not.toContain("observability loaded");
  }, 60_000);

  it("flushes once on shutdown, after the server drained", async () => {
    vi.stubEnv("SENTRY_DSN", "https://key@sentry.invalid/1");
    const handle = await startRun();
    state.order = [];

    await Promise.all([handle.shutdown(), handle.shutdown()]);
    await handle.shutdown();

    expect(state.order).toEqual(["server shutdown", "flush"]);
  }, 60_000);

  it("leaves the signals to the compound and still flushes on shutdown", async () => {
    vi.stubEnv("SENTRY_DSN", "https://key@sentry.invalid/1");
    const runner = await import("../src/runners/switchboard.js");
    const ctx: RunnerContext = {
      projectRoot: root,
      verb: "run",
      env: {},
      parent: { host: "stack", verb: "run" },
    };

    const handle = await runner.run(
      runner.hostSchema.parse(switchboardHost(root)),
      ctx,
    );

    expect(state.signalInstalls).toBe(0);
    await handle.shutdown();
    expect(state.order.slice(-2)).toEqual(["server shutdown", "flush"]);
  }, 60_000);

  it("reports a failed boot before the error propagates", async () => {
    vi.stubEnv("SENTRY_DSN", "https://key@sentry.invalid/1");
    state.bootError = new Error("no database");

    await expect(startRun()).rejects.toThrow("no database");

    expect(state.reported).toEqual([state.bootError]);
  }, 60_000);
});
