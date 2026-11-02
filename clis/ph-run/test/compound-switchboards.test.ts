import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCompound, type RunnerContext } from "@powerhousedao/host-core";
import {
  switchboardConfigSchema,
  type SwitchboardConfig,
  type SwitchboardConfigInput,
} from "@powerhousedao/switchboard/config";
import type * as SwitchboardServer from "@powerhousedao/switchboard/server";
import type { ILogger } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Real runner, service and server; the context's env is empty.

interface Started {
  config: SwitchboardConfig;
  handle: SwitchboardServer.SwitchboardReactor;
}

const state = vi.hoisted(() => ({ started: [] as Started[] }));

vi.mock("@powerhousedao/switchboard/server", async (importOriginal) => {
  const actual = await importOriginal<typeof SwitchboardServer>();
  return {
    ...actual,
    startSwitchboard: async (
      config: SwitchboardConfigInput,
      deps: SwitchboardServer.SwitchboardDeps = {},
    ) => {
      const handle = await actual.startSwitchboard(config, {
        ...deps,
        fatalErrorShutdown: false,
        logger: quietLogger(),
      });
      state.started.push({
        config: switchboardConfigSchema.parse(config),
        handle,
      });
      return handle;
    },
  };
});

function quietLogger(): ILogger {
  const noop = () => undefined;
  const logger = {
    level: "error",
    verbose: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    errorHandler: noop,
    child: () => logger,
  };
  return logger as unknown as ILogger;
}

const SWITCHBOARD_SRC = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../src/runners/switchboard.ts",
);

async function isFree(port: number): Promise<boolean> {
  const server = net.createServer();
  return new Promise((resolve) => {
    server.once("error", () => resolve(false));
    server.listen(port, () => server.close(() => resolve(true)));
  });
}

function memberHost(
  root: string,
  name: string,
  member: {
    drive: string;
    protocol: Record<string, unknown>;
    switchboard: Record<string, unknown>;
  },
) {
  const dir = path.join(root, "stores", name);
  return {
    name,
    runner: { module: SWITCHBOARD_SRC, port: 0 },
    reactor: {
      backends: {
        main: {
          kind: "in-process",
          storage: { kind: "path", dataDir: path.join(dir, "reactor") },
          readModel: { url: path.join(dir, "read-model") },
        },
      },
      protocol: member.protocol,
      drives: [{ slug: member.drive, name: member.drive }],
    },
    config: {
      switchboard: {
        storage: { userDataDir: path.join(dir, "user") },
        packages: { disableLocal: true },
        features: { workflows: false },
        ...member.switchboard,
      },
    },
  };
}

function makeProject(): string {
  const root = mkdtempSync(path.join(tmpdir(), "ph-compound-switchboards-"));
  writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "lab", type: "module" }),
  );
  writeFileSync(path.join(root, "powerhouse.config.json"), "{}");
  const hosts = {
    "sb-a": memberHost(root, "sb-a", {
      drive: "alpha",
      protocol: {
        featureFlags: { documentDecisions: true },
        createSignaturePolicy: "legacy",
      },
      switchboard: {
        auth: { admins: ["0xa"], wsRecheckMs: 1000 },
        inspection: { enabled: false },
      },
    }),
    "sb-b": memberHost(root, "sb-b", {
      drive: "beta",
      protocol: {
        featureFlags: { documentDecisions: false },
        unsupportedStoredDocuments: "read-only",
      },
      switchboard: {
        auth: { documentPermissions: { cacheTtlMs: 500 } },
        inspection: { enabled: true, callsPerMinute: 7 },
      },
    }),
  };
  for (const [name, host] of Object.entries(hosts)) {
    mkdirSync(path.join(root, "hosts", name), { recursive: true });
    writeFileSync(
      path.join(root, "hosts", name, "host.js"),
      `export default ${JSON.stringify(host)};`,
    );
  }
  return root;
}

const compound = {
  name: "stack",
  runner: { module: "@powerhousedao/host-core/runners/compound" },
  children: { a: { host: "sb-a" }, b: { host: "sb-b" } },
  config: { runtimeRecord: false },
};

async function inspectionAnswers(port: number): Promise<boolean> {
  const response = await fetch(`http://localhost:${port}/graphql/inspection`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "{ __typename }" }),
  });
  return response.ok;
}

describe("a compound with two switchboards in one process", () => {
  let root: string;
  const signalsBefore = {
    SIGINT: new Set<NodeJS.SignalsListener>(),
    SIGTERM: new Set<NodeJS.SignalsListener>(),
  };
  const addedListeners = (signal: "SIGINT" | "SIGTERM") =>
    (process.listeners(signal) as NodeJS.SignalsListener[]).filter(
      (listener) => !signalsBefore[signal].has(listener),
    );

  beforeEach(() => {
    root = makeProject();
    state.started = [];
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      signalsBefore[signal] = new Set(
        process.listeners(signal) as NodeJS.SignalsListener[],
      );
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      for (const listener of addedListeners(signal)) {
        process.removeListener(signal, listener);
      }
    }
    rmSync(root, { recursive: true, force: true, maxRetries: 5 });
  });

  it("boots each member on its own config, stores and port", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("shutdown() must not exit the process");
    });
    const envBefore = { ...process.env };
    const ctx: RunnerContext = { projectRoot: root, verb: "run", env: {} };
    const run = () =>
      runCompound(compound, ctx, {
        projectName: "lab",
        installSignalHandlers: false,
      });

    const first = await run();
    expect(process.env).toEqual(envBefore);
    const [a, b] = state.started;
    expect(state.started).toHaveLength(2);

    // Ports: each reports the one it bound.
    expect(a.handle.port).toBeGreaterThan(0);
    expect(b.handle.port).toBeGreaterThan(0);
    expect(a.handle.port).not.toBe(b.handle.port);
    expect(first.started.map((m) => m.outputs.origin)).toEqual([
      `http://localhost:${a.handle.port}`,
      `http://localhost:${b.handle.port}`,
    ]);

    // Settings: each member got its own.
    const storeOf = (name: string, store: string) =>
      path.join(root, "stores", name, store);
    expect(a.config.storage).toMatchObject({
      reactor: { url: storeOf("sb-a", "reactor") },
      readModel: { url: storeOf("sb-a", "read-model") },
      userDataDir: storeOf("sb-a", "user"),
    });
    expect(b.config.storage).toMatchObject({
      reactor: { url: storeOf("sb-b", "reactor") },
      readModel: { url: storeOf("sb-b", "read-model") },
      userDataDir: storeOf("sb-b", "user"),
    });
    expect(a.config.protocol).toMatchObject({
      featureFlags: { documentDecisions: true },
      createSignaturePolicy: "legacy",
      unsupportedStoredDocuments: "refuse",
    });
    expect(b.config.protocol).toMatchObject({
      featureFlags: { documentDecisions: false },
      createSignaturePolicy: "v2-required",
      unsupportedStoredDocuments: "read-only",
    });
    expect(a.config.auth).toMatchObject({ admins: ["0xa"], wsRecheckMs: 1000 });
    expect(a.config.auth.documentPermissions.cacheTtlMs).toBeUndefined();
    expect(b.config.auth).toMatchObject({
      admins: [],
      documentPermissions: { cacheTtlMs: 500 },
    });
    expect(b.config.auth.wsRecheckMs).toBeUndefined();
    expect(a.config.inspection.callsPerMinute).toBeUndefined();
    expect(b.config.inspection.callsPerMinute).toBe(7);
    expect(a.handle.inspectionEnabled).toBe(false);
    expect(b.handle.inspectionEnabled).toBe(true);
    expect(await inspectionAnswers(a.handle.port)).toBe(false);
    expect(await inspectionAnswers(b.handle.port)).toBe(true);

    // Writes: each member's drive and documents stay in its own reactor.
    const driveOn = async (port: number, slug: string) =>
      (await fetch(`http://localhost:${port}/d/${slug}`)).ok;
    expect(await driveOn(a.handle.port, "alpha")).toBe(true);
    expect(await driveOn(a.handle.port, "beta")).toBe(false);
    expect(await driveOn(b.handle.port, "beta")).toBe(true);
    expect(await driveOn(b.handle.port, "alpha")).toBe(false);
    const written = await a.handle.reactor.write.createEmpty(
      "powerhouse/document-drive",
    );
    const docId = (await written.document()).header.id;
    const exists = (handle: Started["handle"]) =>
      handle.reactor.get(docId).then(
        () => true,
        () => false,
      );
    expect(await exists(a.handle)).toBe(true);
    expect(await exists(b.handle)).toBe(false);

    // Shutdown: both stop and free their ports.
    const ports = [a.handle.port, b.handle.port];
    await first.shutdown();
    for (const port of ports) expect(await isFree(port)).toBe(true);
    expect(addedListeners("SIGINT")).toEqual([]);
    expect(addedListeners("SIGTERM")).toEqual([]);

    // A second run reopens each member's own stores.
    for (const name of ["sb-a", "sb-b"]) {
      expect(existsSync(storeOf(name, "reactor"))).toBe(true);
      expect(existsSync(storeOf(name, "read-model"))).toBe(true);
    }
    state.started = [];
    const second = await run();
    try {
      const [a2, b2] = state.started;
      expect(await exists(a2.handle)).toBe(true);
      expect(await exists(b2.handle)).toBe(false);
    } finally {
      await second.shutdown();
    }
    expect(exit).not.toHaveBeenCalled();
  }, 240_000);
});
