import { PGlite } from "@electric-sql/pglite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ReactorBuilder,
  type Database,
  type ILiveReadModelCoordinator,
  type InProcessReactorClientModule,
  type IReadModelCoordinator,
  type ReadModelRegistrationStage,
} from "@powerhousedao/reactor";
import {
  BaseSubgraph,
  type GraphQLManager,
  type PackagePieceEntry,
} from "@powerhousedao/reactor-api";
import { PieceRegistry } from "@powerhousedao/reactor-workflow";
import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { initFeatureFlags } from "../src/feature-flags.js";
import { startSwitchboard } from "../src/server.mjs";
import {
  PH_WORKFLOWS_ENABLED,
  bindPackagePieces,
  composeWorkflowRuntime,
  assertWorkflowPackageLoadable,
  resolveWorkflowsEnabled,
  type BooleanFlagSource,
} from "../src/workflow-runtime.mjs";

function stubLogger(): ILogger & {
  info: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
} {
  const logger = {
    verbose: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  logger.child.mockReturnValue(logger);
  return logger as unknown as ILogger & {
    info: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
}

// The engine, faked at the seam the host loads it through: everything below
// belongs to @powerhousedao/reactor-workflow's own tests.
function fakeEngine() {
  const runtime = {
    registerWebhookEndpoint: vi.fn(() => Promise.resolve()),
    startTriggerSupervisor: vi.fn(),
    shutdown: vi.fn(),
    onOperations: vi.fn((_operations: OperationWithContext[]) =>
      Promise.resolve(),
    ),
  };
  const constructed: {
    db: unknown;
    runtime: unknown;
    init: number;
  }[] = [];

  class FakeWorkflowTriggersReadModel {
    readonly name = "workflow-triggers";
    readonly #record: (typeof constructed)[number];

    constructor(
      db: unknown,
      _operationIndex: unknown,
      _writeCache: unknown,
      _consistencyTracker: unknown,
      boundRuntime: unknown,
    ) {
      this.#record = { db, runtime: boundRuntime, init: 0 };
      constructed.push(this.#record);
    }

    init(): Promise<void> {
      this.#record.init += 1;
      return Promise.resolve();
    }

    indexOperations(operations: OperationWithContext[]): Promise<void> {
      return (this.#record.runtime as typeof runtime).onOperations(operations);
    }
  }

  return {
    runtime,
    constructed,
    module: {
      WORKFLOW_PACKAGE_NAME: "@powerhousedao/workflow",
      WORKFLOW_TRIGGERS_READ_MODEL: "workflow-triggers",
      WORKFLOW_TRIGGERS_READ_MODEL_STAGE:
        "post_ready" as ReadModelRegistrationStage,
      WorkflowTriggersReadModel: FakeWorkflowTriggersReadModel,
      createWorkflowRuntime: vi.fn((_deps: Record<string, unknown>) => runtime),
    },
  };
}

function compose(
  engine: ReturnType<typeof fakeEngine>,
  logger: ILogger,
  overrides: Record<string, unknown> = {},
) {
  return composeWorkflowRuntime({
    reactorClient: {} as never,
    relationalDb: { id: "relational-db" } as never,
    attachments: { id: "attachments" } as never,
    webhooks: { id: "webhooks" } as never,
    authorizationService: {} as never,
    logger,
    load: () => Promise.resolve(engine.module as never),
    ...overrides,
  });
}

describe("resolveWorkflowsEnabled", () => {
  let featureFlags: BooleanFlagSource;

  beforeAll(async () => {
    featureFlags = await initFeatureFlags();
  });

  afterEach(() => {
    delete process.env[PH_WORKFLOWS_ENABLED];
  });

  it("defaults to off", async () => {
    await expect(resolveWorkflowsEnabled({ featureFlags })).resolves.toBe(
      false,
    );
  });

  it("lets the host's option win over the env var", async () => {
    process.env[PH_WORKFLOWS_ENABLED] = "false";

    await expect(
      resolveWorkflowsEnabled({ featureFlags, override: true }),
    ).resolves.toBe(true);

    process.env[PH_WORKFLOWS_ENABLED] = "true";

    await expect(
      resolveWorkflowsEnabled({ featureFlags, override: false }),
    ).resolves.toBe(false);
  });

  it("reads the env var in every form reactor-api accepted", async () => {
    for (const [raw, expected] of [
      ["true", true],
      ["1", true],
      ["false", false],
      ["0", false],
    ] as const) {
      process.env[PH_WORKFLOWS_ENABLED] = raw;
      await expect(
        resolveWorkflowsEnabled({ featureFlags, configEnabled: !expected }),
      ).resolves.toBe(expected);
    }
  });

  it("falls back to the config file, then off", async () => {
    await expect(
      resolveWorkflowsEnabled({ featureFlags, configEnabled: true }),
    ).resolves.toBe(true);
    await expect(
      resolveWorkflowsEnabled({ featureFlags, configEnabled: false }),
    ).resolves.toBe(false);
  });

  // The engine must not be imported at all when workflows are off, so the
  // decision is the flag's alone and is taken before compose is ever called.
  it("is what gates composition", async () => {
    const composeIfEnabled = async () =>
      (await resolveWorkflowsEnabled({ featureFlags }))
        ? "composed"
        : "skipped";

    expect(await composeIfEnabled()).toBe("skipped");
    process.env[PH_WORKFLOWS_ENABLED] = "true";
    expect(await composeIfEnabled()).toBe("composed");
  });
});

describe("assertWorkflowPackageLoadable", () => {
  it("passes when the package resolves", async () => {
    await expect(
      assertWorkflowPackageLoadable(() => Promise.resolve({})),
    ).resolves.toBeUndefined();
  });

  it("names the package a host would have to install when the load fails", async () => {
    const cause = new Error("Cannot find module");
    await expect(
      assertWorkflowPackageLoadable(() => Promise.reject(cause)),
    ).rejects.toMatchObject({ cause });
  });
});

describe("composeWorkflowRuntime", () => {
  let database: Kysely<unknown> | undefined;
  let reactor: Awaited<ReturnType<ReactorBuilder["buildModule"]>> | undefined;

  afterEach(async () => {
    const shutdown = reactor?.reactor.kill();
    await shutdown?.completed;
    await database?.destroy();
    reactor = undefined;
    database = undefined;
  });

  async function buildReactorModule(
    coordinator?: IReadModelCoordinator,
  ): Promise<InProcessReactorClientModule> {
    database = new Kysely<unknown>({
      dialect: new PGliteDialect(new PGlite()),
    });
    const builder = new ReactorBuilder().withKysely(
      database as unknown as Kysely<Database>,
    );
    if (coordinator) builder.withReadModelCoordinator(coordinator);
    reactor = await builder.buildModule();
    return { reactorModule: reactor } as InProcessReactorClientModule;
  }

  it("hands the engine the host surfaces it declares", async () => {
    const engine = fakeEngine();
    await compose(engine, stubLogger());

    expect(engine.module.createWorkflowRuntime).toHaveBeenCalledTimes(1);
    const [deps] = engine.module.createWorkflowRuntime.mock.calls[0]!;
    expect(deps.relationalDb).toEqual({ id: "relational-db" });
    expect(deps.attachments).toEqual({ id: "attachments" });
    expect(deps.webhooks).toEqual({ id: "webhooks" });
    expect(typeof deps.assertCanRead).toBe("function");
    expect(typeof deps.assertCanWrite).toBe("function");
    expect(typeof deps.canReadAttachmentRef).toBe("function");
  });

  it("serves a subgraph the GraphQL manager can construct", async () => {
    const engine = fakeEngine();
    const { subgraph } = await compose(engine, stubLogger());

    expect(subgraph.prototype).toBeInstanceOf(BaseSubgraph);
  });

  it("registers the trigger read model post_ready and feeds the runtime", async () => {
    const engine = fakeEngine();
    const clientModule = await buildReactorModule();
    const coordinator = clientModule.reactorModule!
      .readModelCoordinator as ILiveReadModelCoordinator;
    const addReadModel = vi.spyOn(coordinator, "addReadModel");
    const logger = stubLogger();

    const workflows = await compose(engine, logger, { clientModule });

    expect(workflows.triggers).toEqual({ status: "available" });
    expect(addReadModel).toHaveBeenCalledTimes(1);
    expect(addReadModel.mock.calls[0]![1]).toBe("post_ready");
    // Constructed once, initialised before it was registered, bound to the
    // runtime this composition built.
    expect(engine.constructed).toHaveLength(1);
    expect(engine.constructed[0]!.init).toBe(1);
    expect(engine.constructed[0]!.runtime).toBe(engine.runtime);

    const registered = addReadModel.mock.calls[0]![0];
    const operations = [] as OperationWithContext[];
    await registered.indexOperations(operations);
    expect(engine.runtime.onOperations).toHaveBeenCalledWith(operations);
    expect(
      coordinator.readModels.filter(({ name }) => name === "workflow-triggers"),
    ).toHaveLength(1);
  });

  it("reports the intake unavailable and says so loudly", async () => {
    const engine = fakeEngine();
    const customCoordinator: IReadModelCoordinator = {
      readModels: [],
      start: vi.fn(),
      stop: vi.fn(),
      drain: vi.fn().mockResolvedValue(undefined),
      getChainDepth: vi.fn().mockReturnValue(0),
    };
    const clientModule = await buildReactorModule(customCoordinator);
    const logger = stubLogger();

    const workflows = await compose(engine, logger, { clientModule });

    expect(workflows.triggers).toEqual({
      status: "unavailable",
      reason: "live-read-model-registration-unsupported",
    });
    expect(engine.constructed).toHaveLength(0);
    expect(customCoordinator.readModels).toEqual([]);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error.mock.calls[0]![0]).toContain("NOT armed");
  });

  it("reports the intake unavailable without an in-process reactor", async () => {
    const engine = fakeEngine();
    const logger = stubLogger();

    const workflows = await compose(engine, logger, {
      clientModule: {} as InProcessReactorClientModule,
    });

    expect(workflows.triggers).toEqual({
      status: "unavailable",
      reason: "in-process-reactor-module-unavailable",
    });
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it("arms the webhooks and the supervisor on start", async () => {
    const engine = fakeEngine();
    const workflows = await compose(engine, stubLogger());

    await workflows.start();

    expect(engine.runtime.registerWebhookEndpoint).toHaveBeenCalledTimes(1);
    expect(engine.runtime.startTriggerSupervisor).toHaveBeenCalledTimes(1);
  });

  it("shuts the runtime down once on stop", async () => {
    const engine = fakeEngine();
    const workflows = await compose(engine, stubLogger());
    await workflows.start();

    await workflows.stop();
    await workflows.stop();

    expect(engine.runtime.shutdown).toHaveBeenCalledTimes(1);
  });

  it("names the package a host would have to install when the load fails", async () => {
    const cause = new Error("Cannot find module");
    const failing = compose(fakeEngine(), stubLogger(), {
      load: () => Promise.reject(cause),
    });

    await expect(failing).rejects.toThrow("@powerhousedao/reactor-workflow");
    await expect(failing).rejects.toMatchObject({ cause });
  });
});

// The GraphQL manager rides on the boot result without being on its public
// type, and the subgraph registers late: poll rather than race it.
async function pollWorkflowSubgraph(
  switchboard: Awaited<ReturnType<typeof startSwitchboard>>,
): Promise<{ name: string } | undefined> {
  const { graphqlManager } = (
    switchboard as unknown as {
      api: { graphqlManager: GraphQLManager };
    }
  ).api;
  for (let attempt = 0; attempt < 100; attempt++) {
    const subgraph = graphqlManager.getSubgraphByName("workflow-runtime");
    if (subgraph) return subgraph;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return undefined;
}

describe("booting Switchboard with workflows on", () => {
  it("arms the intake and registers the workflow document models", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "switchboard-workflows-"));
    const previousReactorDb = process.env.PH_REACTOR_DATABASE_URL;
    process.env.PH_REACTOR_DATABASE_URL = join(tempRoot, "reactor-storage");
    let switchboard: Awaited<ReturnType<typeof startSwitchboard>> | undefined;

    try {
      switchboard = await startSwitchboard({
        workflows: { enabled: true },
        dbPath: join(tempRoot, "read-model"),
        port: 0,
        mcp: false,
        disableLocalPackages: true,
        identity: { keypairPath: join(tempRoot, "identity.json") },
        logger: stubLogger(),
      });

      expect(switchboard.workflowTriggers).toEqual({ status: "available" });
      const { results } = await switchboard.reactor.getDocumentModelModules();
      expect(
        results.map(({ documentModel }) => documentModel.global.id),
      ).toContain("powerhouse/workflow");
      // The subgraph is registered late, so the schema it joins arrives after
      // the boot resolves; poll rather than race it.
      await expect(pollWorkflowSubgraph(switchboard)).resolves.toMatchObject({
        name: "workflow-runtime",
      });

      await switchboard.shutdown();
      switchboard = undefined;
    } finally {
      await switchboard?.shutdown();
      if (previousReactorDb === undefined) {
        delete process.env.PH_REACTOR_DATABASE_URL;
      } else {
        process.env.PH_REACTOR_DATABASE_URL = previousReactorDb;
      }
      await rm(tempRoot, { recursive: true, force: true });
    }
  }, 60_000);
});

describe("bindPackagePieces", () => {
  // The manager's shape, no more of it than the binding uses.
  function stubSource(initial: Map<string, PackagePieceEntry[]>) {
    const handlers: ((pieces: Map<string, PackagePieceEntry[]>) => void)[] = [];
    return {
      getPieces: () => initial,
      onPiecesChange(
        handler: (pieces: Map<string, PackagePieceEntry[]>) => void,
      ) {
        handlers.push(handler);
      },
      emit(pieces: Map<string, PackagePieceEntry[]>) {
        for (const handler of handlers) handler(pieces);
      },
    };
  }

  const entry = (name: string, version: string): PackagePieceEntry => ({
    name,
    version,
    bundleDir: `/pkg/dist/node/pieces/${name}`,
  });

  it("fills the registry from what the manager already loaded", () => {
    const registry = new PieceRegistry();
    const source = stubSource(
      new Map([
        ["@acme/pack", [entry("@acme/piece-a", "1.0.0")]],
        ["/srv/project", [entry("@acme/piece-b", "2.0.0")]],
      ]),
    );

    bindPackagePieces(registry, source);

    expect(registry.versions()).toEqual({
      "@acme/piece-a": "1.0.0",
      "@acme/piece-b": "2.0.0",
    });
  });

  it("refills on every change, so a rebuilt package needs no restart", () => {
    const registry = new PieceRegistry();
    const source = stubSource(new Map());

    bindPackagePieces(registry, source);
    expect(registry.entries()).toEqual([]);

    source.emit(new Map([["/srv/project", [entry("@acme/piece-b", "2.0.0")]]]));
    expect(registry.versions()).toEqual({ "@acme/piece-b": "2.0.0" });

    // And a package that stops shipping one loses it.
    source.emit(new Map());
    expect(registry.entries()).toEqual([]);
  });
});
