import { mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { toStartedHandle, type RunnerContext } from "@powerhousedao/host-core";
import {
  ReactorClientBuilder,
  type InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import type * as SwitchboardServer from "@powerhousedao/switchboard/server";
import type { ILogger } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as switchboardRunner from "../src/runners/switchboard.js";

/**
 * The switchboard handle's shutdown against the real server and reactor:
 * the runner and the service are real, and only the server's options are
 * pinned to a temp dir (stores, identity) and kept off process-wide fatal
 * handlers and local packages, so the test leaves nothing behind.
 */

const state = vi.hoisted(() => ({ tempRoot: "" }));

vi.mock("@powerhousedao/switchboard/server", async (importOriginal) => {
  const actual = await importOriginal<typeof SwitchboardServer>();
  return {
    ...actual,
    startSwitchboard: (options: SwitchboardServer.StartServerOptions) =>
      actual.startSwitchboard({
        ...options,
        dbPath: path.join(state.tempRoot, "read-model"),
        identity: { keypairPath: path.join(state.tempRoot, "identity.json") },
        disableLocalPackages: true,
        packages: [],
        workflows: { enabled: false },
        fatalErrorShutdown: false,
        logger: quietLogger(),
      }),
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

async function isFree(port: number): Promise<boolean> {
  const server = net.createServer();
  return new Promise((resolve) => {
    server.once("error", () => resolve(false));
    server.listen(port, () => server.close(() => resolve(true)));
  });
}

describe("switchboard handle shutdown (real server)", () => {
  let previousReactorDb: string | undefined;
  const signalsBefore = {
    SIGINT: new Set<NodeJS.SignalsListener>(),
    SIGTERM: new Set<NodeJS.SignalsListener>(),
  };
  const addedListeners = (signal: "SIGINT" | "SIGTERM") =>
    (process.listeners(signal) as NodeJS.SignalsListener[]).filter(
      (listener) => !signalsBefore[signal].has(listener),
    );

  beforeEach(() => {
    state.tempRoot = mkdtempSync(path.join(tmpdir(), "ph-sb-shutdown-"));
    previousReactorDb = process.env.PH_REACTOR_DATABASE_URL;
    process.env.PH_REACTOR_DATABASE_URL = path.join(
      state.tempRoot,
      "reactor-storage",
    );
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      signalsBefore[signal] = new Set(
        process.listeners(signal) as NodeJS.SignalsListener[],
      );
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // The owned reactor's withSignalHandlers() listeners outlive the test.
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      for (const listener of addedListeners(signal)) {
        process.removeListener(signal, listener);
      }
    }
    if (previousReactorDb === undefined) {
      delete process.env.PH_REACTOR_DATABASE_URL;
    } else {
      process.env.PH_REACTOR_DATABASE_URL = previousReactorDb;
    }
    rmSync(state.tempRoot, { recursive: true, force: true });
  });

  it("stops the reactor and frees the port once across repeated and concurrent calls", async () => {
    // Capture the reactor module the server builds for itself.
    const realBuild = Object.getOwnPropertyDescriptor(
      ReactorClientBuilder.prototype,
      "buildModule",
    )?.value as (
      this: ReactorClientBuilder,
    ) => Promise<InProcessReactorClientModule>;
    let owned: InProcessReactorClientModule | undefined;
    vi.spyOn(ReactorClientBuilder.prototype, "buildModule").mockImplementation(
      async function (this: ReactorClientBuilder) {
        owned = await realBuild.call(this);
        return owned;
      },
    );
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("shutdown() must not exit the process");
    });

    const host = switchboardRunner.hostSchema.parse({
      name: "lab-switchboard",
      runner: { module: "m", port: 0 },
    });
    const handle = toStartedHandle(
      await switchboardRunner.run(host, {
        projectRoot: state.tempRoot,
        verb: "run",
        env: {},
      } satisfies RunnerContext),
      "sb",
    );
    await handle.ready;
    const { origin } = handle.outputs as switchboardRunner.SwitchboardOutputs;
    const port = Number(new URL(origin).port);
    const reactorModule = owned?.reactorModule;
    if (!reactorModule) throw new Error("the server built no reactor module");
    const kill = vi.spyOn(reactorModule.reactor, "kill");
    const destroy = vi.spyOn(reactorModule.database, "destroy");
    expect(await isFree(port)).toBe(false);

    await Promise.all([handle.shutdown?.(), handle.shutdown?.()]);
    await handle.shutdown?.();

    expect(kill).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(await isFree(port)).toBe(true);
    expect(exit).not.toHaveBeenCalled();
  }, 120_000);

  it("reports the OS-picked port when the host asks for port 0", async () => {
    const host = switchboardRunner.hostSchema.parse({
      name: "lab-switchboard",
      runner: { module: "m", port: 0 },
    });
    const handle = toStartedHandle(
      await switchboardRunner.run(host, {
        projectRoot: state.tempRoot,
        verb: "run",
        env: {},
      } satisfies RunnerContext),
      "sb",
    );
    try {
      await handle.ready;
      const outputs = handle.outputs as switchboardRunner.SwitchboardOutputs;
      const port = Number(new URL(outputs.origin).port);
      expect(port).toBeGreaterThan(0);
      const graphql = await fetch(outputs.endpoints.graphql, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "{ system { __typename } }" }),
      });
      expect(await graphql.json()).toEqual({
        data: { system: { __typename: "SystemInfo" } },
      });
      const drives = Object.values(outputs.drives);
      expect(drives.length).toBeGreaterThan(0);
      for (const drive of drives) {
        expect(drive.url.startsWith(`${outputs.origin}/d/`)).toBe(true);
        expect((await fetch(drive.url)).ok).toBe(true);
      }
    } finally {
      await handle.shutdown?.();
    }
  }, 120_000);
});
