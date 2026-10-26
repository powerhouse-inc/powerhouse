import { PGlite } from "@electric-sql/pglite";
import {
  ReactorBuilder,
  ReactorClientBuilder,
  type Database,
  type InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import type { ILogger } from "document-model";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { applySwitchboardReactorDefaults } from "../src/builder-defaults.mjs";
import { startSwitchboard } from "../src/server.mjs";

type Switchboard = Awaited<ReturnType<typeof startSwitchboard>>;

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (!address || typeof address === "string") throw new Error("no port");
  return address.port;
}

/** True when nothing holds `port` any more. */
async function portIsFree(port: number): Promise<boolean> {
  const server = createServer();
  return new Promise((resolve) => {
    server.once("error", () => resolve(false));
    server.listen(port, () => server.close(() => resolve(true)));
  });
}

/** initServer returns the reactor-api handle too; SwitchboardReactor does not
 * type it. Spying on its dispose shows how often the api was drained. */
function apiOf(sb: object): { dispose: () => Promise<void> } {
  const api: unknown = Reflect.get(sb, "api");
  if (
    typeof api !== "object" ||
    api === null ||
    typeof Reflect.get(api, "dispose") !== "function"
  ) {
    throw new Error("switchboard returned no api handle");
  }
  return api as { dispose: () => Promise<void> };
}

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

describe("SwitchboardReactor.shutdown", () => {
  let tempRoot: string;
  let previousReactorDb: string | undefined;
  let switchboard: Switchboard | undefined;
  const signalsBefore = {
    SIGINT: new Set<NodeJS.SignalsListener>(),
    SIGTERM: new Set<NodeJS.SignalsListener>(),
  };
  const addedListeners = (signal: "SIGINT" | "SIGTERM") =>
    (process.listeners(signal) as NodeJS.SignalsListener[]).filter(
      (listener) => !signalsBefore[signal].has(listener),
    );

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "switchboard-shutdown-"));
    previousReactorDb = process.env.PH_REACTOR_DATABASE_URL;
    process.env.PH_REACTOR_DATABASE_URL = join(tempRoot, "reactor-storage");
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      signalsBefore[signal] = new Set(
        process.listeners(signal) as NodeJS.SignalsListener[],
      );
    }
  });

  afterEach(async () => {
    await switchboard?.shutdown().catch(() => undefined);
    switchboard = undefined;
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
    await rm(tempRoot, { recursive: true, force: true });
  });

  async function start(
    reactor?: InProcessReactorClientModule,
  ): Promise<Switchboard> {
    switchboard = await startSwitchboard({
      reactor,
      workflows: { enabled: false },
      dbPath: join(tempRoot, "read-model"),
      port: 0,
      mcp: false,
      disableLocalPackages: true,
      identity: { keypairPath: join(tempRoot, "identity.json") },
      logger: stubLogger(),
    });
    return switchboard;
  }

  /**
   * Spies on the reactor module the switchboard builds for itself, from the
   * moment it is built (an aborted boot tears it down before returning).
   */
  function watchOwnedReactor() {
    const realBuild = Object.getOwnPropertyDescriptor(
      ReactorClientBuilder.prototype,
      "buildModule",
    )?.value as (
      this: ReactorClientBuilder,
    ) => Promise<InProcessReactorClientModule>;
    const watched: {
      kill?: MockInstance<() => unknown>;
      destroy?: MockInstance<() => Promise<void>>;
    } = {};
    vi.spyOn(ReactorClientBuilder.prototype, "buildModule").mockImplementation(
      async function (this: ReactorClientBuilder) {
        const built = await realBuild.call(this);
        if (!built.reactorModule) throw new Error("no reactor module built");
        watched.kill = vi.spyOn(built.reactorModule.reactor, "kill");
        watched.destroy = vi.spyOn(built.reactorModule.database, "destroy");
        return built;
      },
    );
    return watched;
  }

  /** Stubbed before boot: the signal handler binds process.exit when the
   * reactor is built. */
  function stubExit() {
    const codes: Array<number | undefined> = [];
    let resolveExit: (code: number | undefined) => void = () => undefined;
    const exited = new Promise<number | undefined>((resolve) => {
      resolveExit = resolve;
    });
    vi.spyOn(process, "exit").mockImplementation((code) => {
      const value = code === undefined ? undefined : Number(code);
      codes.push(value);
      resolveExit(value);
      return undefined as never;
    });
    return { codes, exited };
  }

  function raiseSigint(): void {
    const sigint = addedListeners("SIGINT");
    expect(sigint).toHaveLength(1);
    sigint[0]!("SIGINT");
  }

  it("stops an owned reactor and frees the port once, however often it is called", async () => {
    const reactor = watchOwnedReactor();
    const exit = stubExit();

    const sb = await start();
    const dispose = vi.spyOn(apiOf(sb), "dispose");
    expect(await portIsFree(sb.port)).toBe(false);

    await Promise.all([sb.shutdown(), sb.shutdown()]);
    await sb.shutdown();

    expect(reactor.kill).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(reactor.destroy).toHaveBeenCalledTimes(1);
    expect(await portIsFree(sb.port)).toBe(true);
    expect(exit.codes).toEqual([]);

    // A later SIGINT joins the finished teardown and only exits.
    raiseSigint();
    expect(await exit.exited).toBe(0);
    expect(exit.codes).toEqual([0]);
    expect(reactor.kill).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(reactor.destroy).toHaveBeenCalledTimes(1);
  }, 60_000);

  it("an aborted boot tears the owned reactor down once, through its shutdown", async () => {
    const reactor = watchOwnedReactor();
    const exit = stubExit();
    const previousSource = process.env.RENOWN_SOURCE;
    // No loaded package serves the renown read model: the boot aborts after
    // the reactor and the api are up.
    process.env.RENOWN_SOURCE = "self";
    const port = await freePort();

    try {
      await expect(
        startSwitchboard({
          workflows: { enabled: false },
          dbPath: join(tempRoot, "read-model"),
          port,
          strictPort: true,
          mcp: false,
          disableLocalPackages: true,
          identity: { keypairPath: join(tempRoot, "identity.json") },
          logger: stubLogger(),
        }),
      ).rejects.toThrow(/no loaded package serves/);
    } finally {
      if (previousSource === undefined) {
        delete process.env.RENOWN_SOURCE;
      } else {
        process.env.RENOWN_SOURCE = previousSource;
      }
    }

    expect(reactor.kill).toHaveBeenCalledTimes(1);
    expect(reactor.destroy).toHaveBeenCalledTimes(1);
    expect(await portIsFree(port)).toBe(true);

    raiseSigint();
    expect(await exit.exited).toBe(0);
    expect(reactor.kill).toHaveBeenCalledTimes(1);
    expect(reactor.destroy).toHaveBeenCalledTimes(1);
  }, 60_000);

  it("drains the api once and leaves a caller-provided reactor running", async () => {
    const database = new Kysely<Database>({
      dialect: new PGliteDialect(new PGlite()),
    });
    const reactorBuilder = new ReactorBuilder().withKysely(database);
    const clientBuilder = new ReactorClientBuilder().withReactorBuilder(
      reactorBuilder,
    );
    applySwitchboardReactorDefaults(reactorBuilder, clientBuilder, {
      signalHandlers: false,
    });
    const caller = await clientBuilder.buildModule();
    const callerModule = caller.reactorModule;
    if (!callerModule) throw new Error("caller built no reactor module");

    try {
      const sb = await start(caller);
      const kill = vi.spyOn(callerModule.reactor, "kill");
      const dispose = vi.spyOn(apiOf(sb), "dispose");

      await Promise.all([sb.shutdown(), sb.shutdown()]);

      expect(dispose).toHaveBeenCalledTimes(1);
      expect(kill).not.toHaveBeenCalled();
      expect(await portIsFree(sb.port)).toBe(true);
    } finally {
      await callerModule.shutdown();
    }
  }, 60_000);
});
