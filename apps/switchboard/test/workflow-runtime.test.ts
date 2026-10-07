import { PGlite } from "@electric-sql/pglite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ReactorBuilder,
  ReactorClientBuilder,
  type Database,
  type InProcessReactorClientModule,
  type IReadModelCoordinator,
} from "@powerhousedao/reactor";
import {
  BaseSubgraph,
  type GraphQLManager,
  type PackagePieceEntry,
} from "@powerhousedao/reactor-api";
import {
  PieceRegistry,
  type WorkflowRuntimeService,
} from "@powerhousedao/reactor-workflow";
import {
  createRelationalDb,
  type IRelationalDb,
  type IWebhookScope,
  type WebhookSpec,
} from "@powerhousedao/shared/processors";
import type { ILogger } from "document-model";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { initFeatureFlags } from "../src/feature-flags.js";
import { startSwitchboard } from "../src/server.mjs";
import {
  PH_WORKFLOWS_ENABLED,
  bindPackagePieces,
  canReadAttachmentRef,
  composeWorkflowRuntime,
  assertWorkflowPackageLoadable,
  hostPrincipalOf,
  isWorkflowSingletonConflict,
  retryWorkflowSingleton,
  workflowSingletonLossHandler,
  reactorAccessOf,
  resolveWorkflowsEnabled,
  type BooleanFlagSource,
  type ComposedWorkflowRuntime,
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
});

describe("assertWorkflowPackageLoadable", () => {
  it("passes when the package resolves", async () => {
    await expect(
      assertWorkflowPackageLoadable(() => Promise.resolve({})),
    ).resolves.toBeUndefined();
  });

  it("names the package a host would have to install when the load fails", async () => {
    const cause = new Error("Cannot find module");
    const failing = assertWorkflowPackageLoadable(() => Promise.reject(cause));
    await expect(failing).rejects.toThrow("@powerhousedao/workflow");
    await expect(failing).rejects.toMatchObject({ cause });
  });
});

// The endpoint family as the host's webhook service holds it, in memory.
function memoryWebhooks() {
  const families: WebhookSpec[] = [];
  const scope: IWebhookScope = {
    hasPublicOrigin: true,
    register: (spec) => {
      families.push(spec);
      return Promise.resolve({
        endpointFor: (key) =>
          Promise.resolve({
            token: key,
            url: `https://hooks.test/${key}`,
            createdAt: new Date().toISOString(),
          }),
        revoke: () => Promise.resolve(),
        list: () => Promise.resolve([]),
      });
    },
  };
  return { families, scope };
}

describe("composeWorkflowRuntime", () => {
  let databases: Kysely<unknown>[] = [];
  let module: InProcessReactorClientModule | undefined;
  let composed: ComposedWorkflowRuntime | undefined;

  afterEach(async () => {
    await composed?.stop();
    await module?.reactor.kill().completed;
    for (const database of databases) await database.destroy();
    composed = undefined;
    module = undefined;
    databases = [];
  });

  function pglite(): Kysely<unknown> {
    const database = new Kysely<unknown>({
      dialect: new PGliteDialect(new PGlite()),
    });
    databases.push(database);
    return database;
  }

  async function buildReactorModule(
    coordinator?: IReadModelCoordinator,
  ): Promise<InProcessReactorClientModule> {
    const builder = new ReactorBuilder().withKysely(
      pglite() as unknown as Kysely<Database>,
    );
    if (coordinator) builder.withReadModelCoordinator(coordinator);
    module = await new ReactorClientBuilder()
      .withReactorBuilder(builder)
      .buildModule();
    return module;
  }

  // The real engine, loaded as production loads it.
  async function compose(
    clientModule: InProcessReactorClientModule,
    overrides: Partial<Parameters<typeof composeWorkflowRuntime>[0]> = {},
  ): Promise<ComposedWorkflowRuntime> {
    composed = await composeWorkflowRuntime({
      reactorClient: clientModule.client,
      clientModule,
      relationalDb: createRelationalDb(pglite()) as IRelationalDb,
      attachments: {} as never,
      authorizationService: {} as never,
      logger: stubLogger(),
      ...overrides,
    });
    return composed;
  }

  it("lets a step read any well-formed attachment ref", async () => {
    const hash = "a".repeat(64);
    // No document references it: runs read attachments as they read documents.
    expect(await canReadAttachmentRef("wf-1", `attachment://v1:${hash}`)).toBe(
      true,
    );
    expect(await canReadAttachmentRef("wf-1", `attachment://v2:${hash}`)).toBe(
      false,
    );
    expect(await canReadAttachmentRef("wf-1", "not-a-ref")).toBe(false);
  });

  it("serves a subgraph the GraphQL manager can construct", async () => {
    const { subgraph } = await compose(await buildReactorModule());

    expect(subgraph.prototype).toBeInstanceOf(BaseSubgraph);
  });

  it("registers the trigger read model on the reactor's coordinator", async () => {
    const clientModule = await buildReactorModule();

    const workflows = await compose(clientModule);

    expect(workflows.triggers).toEqual({ status: "available" });
    expect(
      clientModule.reactorModule!.readModelCoordinator.readModels.filter(
        ({ name }) => name === "workflow-triggers",
      ),
    ).toHaveLength(1);
  });

  it("reports the intake unavailable on a coordinator without live registration", async () => {
    const customCoordinator: IReadModelCoordinator = {
      readModels: [],
      start: vi.fn(),
      stop: vi.fn(),
      drain: vi.fn().mockResolvedValue(undefined),
      getChainDepth: vi.fn().mockReturnValue(0),
    };

    const workflows = await compose(
      await buildReactorModule(customCoordinator),
    );

    expect(workflows.triggers).toEqual({
      status: "unavailable",
      reason: "live-read-model-registration-unsupported",
    });
    expect(customCoordinator.readModels).toEqual([]);
  });

  it("reports the intake unavailable without an in-process reactor", async () => {
    const clientModule = await buildReactorModule();

    const workflows = await compose(clientModule, {
      clientModule: {} as InProcessReactorClientModule,
    });

    expect(workflows.triggers).toEqual({
      status: "unavailable",
      reason: "in-process-reactor-module-unavailable",
    });
  });

  it("arms the webhooks and the supervisor on start, and stops them once", async () => {
    const webhooks = memoryWebhooks();
    const clientModule = await buildReactorModule();
    // Intervals only, from here on: the singleton lease's heartbeat and the
    // run-retention sweep from compose, then the supervisor's tick.
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      const workflows = await compose(clientModule, {
        webhooks: webhooks.scope,
      });
      expect(vi.getTimerCount()).toBe(2);

      await workflows.start();

      expect(webhooks.families.map(({ name }) => name)).toEqual(["trigger"]);
      // The real runtime answers for it: an unknown workflow is not armed.
      await expect(
        webhooks.families[0]!.policyFor?.("wf-unknown"),
      ).resolves.toBeUndefined();
      expect(vi.getTimerCount()).toBe(3);

      await workflows.stop();
      await workflows.stop();

      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("names the package a host would have to install when the load fails", async () => {
    const cause = new Error("Cannot find module");
    const failing = compose(await buildReactorModule(), {
      load: () => Promise.reject(cause),
    });

    await expect(failing).rejects.toThrow("@powerhousedao/reactor-workflow");
    await expect(failing).rejects.toMatchObject({ cause });
  });

  // Placement (plan agreed decision 3): the claim is taken before the runtime
  // exists and released on the way out. Distinct storage ids give the two
  // composes distinct owner names, as two hosts would have.
  function composeSecond(
    clientModule: InProcessReactorClientModule,
    relationalDb: IRelationalDb,
  ): Promise<ComposedWorkflowRuntime> {
    return composeWorkflowRuntime({
      reactorClient: clientModule.client,
      clientModule: {} as InProcessReactorClientModule,
      relationalDb,
      attachments: {} as never,
      authorizationService: {} as never,
      logger: stubLogger(),
      storageId: "/srv/slot-b",
    });
  }

  it("claims the workflow singleton and refuses a second owner until it is released", async () => {
    const clientModule = await buildReactorModule();
    const relationalDb = createRelationalDb(pglite()) as IRelationalDb;
    const first = await compose(clientModule, {
      relationalDb,
      storageId: "/srv/slot-a",
    });
    expect(first.singletonOwner).toBeDefined();

    const refused = await composeSecond(clientModule, relationalDb).catch(
      (error: unknown) => error,
    );
    expect(isWorkflowSingletonConflict(refused)).toBe(true);

    await first.stop();
    const second = await composeSecond(clientModule, relationalDb);
    try {
      expect(second.singletonOwner).toBeDefined();
      expect(second.singletonOwner).not.toBe(first.singletonOwner);
    } finally {
      await second.stop();
    }
  });

  it("hands the claim back when composing fails after it", async () => {
    const clientModule = await buildReactorModule();
    const relationalDb = createRelationalDb(pglite()) as IRelationalDb;
    const engine = await import("@powerhousedao/reactor-workflow");

    await expect(
      compose(clientModule, {
        relationalDb,
        storageId: "/srv/slot-a",
        load: () =>
          Promise.resolve({
            ...engine,
            createWorkflowRuntime: () => {
              throw new Error("the runtime could not be built");
            },
          }),
      }),
    ).rejects.toThrow("the runtime could not be built");

    const next = await composeSecond(clientModule, relationalDb);
    try {
      expect(next.singletonOwner).toBeDefined();
    } finally {
      await next.stop();
    }
  });

  // A rolling deploy under one stable owner name: the next pod's claim wins,
  // and this one must stop running workflows rather than become a second
  // writer. There is no re-claim; it stays down until restarted.
  it("shuts the runtime down when a newer claim takes the singleton", async () => {
    const clientModule = await buildReactorModule();
    const relationalDb = createRelationalDb(pglite()) as IRelationalDb;
    const engine = await import("@powerhousedao/reactor-workflow");
    const lost = vi.fn();
    let newer:
      | Awaited<ReturnType<typeof engine.acquireWorkflowSingletonLease>>
      | undefined;
    // The lease measures its silence on performance.now().
    vi.useFakeTimers({
      toFake: ["setInterval", "clearInterval", "performance"],
    });
    try {
      const workflows = await compose(clientModule, {
        relationalDb,
        storageId: "/srv/slot-a",
        onSingletonLost: lost,
      });
      await workflows.start();
      expect(workflows.triggers).toEqual({ status: "available" });

      // The older holder went quiet, so its own slot may take over.
      const leaseDb = await relationalDb.createNamespace<{
        workflow_singleton: { heartbeat_at: Date };
      }>("workflow_runtime");
      await leaseDb
        .updateTable("workflow_singleton")
        .set({ heartbeat_at: new Date(Date.now() - 3_600_000) })
        .execute();
      newer = await engine.acquireWorkflowSingletonLease({
        relationalDb,
        storageId: "/srv/slot-a",
        logger: stubLogger(),
      });
      expect(newer.owner).toBe(workflows.singletonOwner);

      await vi.advanceTimersByTimeAsync(engine.SINGLETON_HEARTBEAT_MS);
      await vi.waitFor(() =>
        expect(lost).toHaveBeenCalledWith({
          reason: "taken",
          heldBy: newer!.owner,
        }),
      );
      expect(lost).toHaveBeenCalledTimes(1);
      expect(workflows.triggers).toEqual({
        status: "unavailable",
        reason: "workflow-singleton-lost",
      });
      // Only the newer claim's heartbeat is left running.
      expect(vi.getTimerCount()).toBe(1);

      await workflows.start();
      expect(vi.getTimerCount()).toBe(1);

      await workflows.stop();
      expect(await newer.heartbeat()).toBe(true);
    } finally {
      await newer?.release();
      vi.useRealTimers();
    }
  });

  it("shuts the runtime down before handing the claim back when composing fails", async () => {
    const clientModule = await buildReactorModule();
    const relationalDb = createRelationalDb(pglite()) as IRelationalDb;
    const engine = await import("@powerhousedao/reactor-workflow");
    const shutdowns: ReturnType<typeof vi.fn>[] = [];

    await expect(
      compose(clientModule, {
        relationalDb,
        storageId: "/srv/slot-a",
        load: () =>
          Promise.resolve({
            ...engine,
            createWorkflowRuntime: (host) => {
              const runtime = engine.createWorkflowRuntime(host);
              shutdowns.push(vi.spyOn(runtime, "shutdown"));
              return runtime;
            },
            WorkflowTriggersReadModel: class {
              constructor() {
                throw new Error("the read model could not be built");
              }
            } as never,
          }),
      }),
    ).rejects.toThrow("the read model could not be built");

    expect(shutdowns).toHaveLength(1);
    expect(shutdowns[0]).toHaveBeenCalledOnce();
    const next = await composeSecond(clientModule, relationalDb);
    await next.stop();
  });

  // Embedded PGlite: no other process can open the journal, so the lease must
  // not turn workflows off over a stalled renewal.
  it("lets the lease fence itself only over a journal others can open", async () => {
    const engine = await import("@powerhousedao/reactor-workflow");
    const selfFence: (boolean | undefined)[] = [];
    const load = () =>
      Promise.resolve({
        ...engine,
        acquireWorkflowSingletonLease: (
          options: Parameters<typeof engine.acquireWorkflowSingletonLease>[0],
        ) => {
          selfFence.push(options.selfFence);
          return engine.acquireWorkflowSingletonLease(options);
        },
      });

    for (const exclusiveJournal of [true, false]) {
      const composed = await compose(await buildReactorModule(), {
        relationalDb: createRelationalDb(pglite()) as IRelationalDb,
        exclusiveJournal,
        load,
      });
      await composed.stop();
    }

    expect(selfFence).toEqual([false, true]);
  });

  it("opens no journal when the lease is lost before the runtime exists", async () => {
    const clientModule = await buildReactorModule();
    const relationalDb = createRelationalDb(pglite()) as IRelationalDb;
    const engine = await import("@powerhousedao/reactor-workflow");
    const createWorkflowRuntime = vi.fn(engine.createWorkflowRuntime);

    const composing = compose(clientModule, {
      relationalDb,
      load: () =>
        Promise.resolve({
          ...engine,
          createWorkflowRuntime,
          acquireWorkflowSingletonLease: async (options) => {
            const lease = await engine.acquireWorkflowSingletonLease(options);
            options.onLost?.({ reason: "taken", heldBy: "thief" });
            return lease;
          },
        }),
    });

    await expect(composing).rejects.toMatchObject({
      name: "WorkflowSingletonConflictError",
      owner: "thief",
    });
    expect(createWorkflowRuntime).not.toHaveBeenCalled();
  });

  // A rolling deploy whose slots have different owner names: the new pod is
  // refused while the old one holds the lease, and must pick workflows up
  // once the old pod releases it rather than leave nobody running them.
  it("composes a refused host once the holder releases the singleton", async () => {
    const clientModule = await buildReactorModule();
    const relationalDb = createRelationalDb(pglite()) as IRelationalDb;
    const holder = await compose(clientModule, {
      relationalDb,
      storageId: "/srv/slot-a",
    });
    const onComposed = vi.fn(() => Promise.resolve());
    const retry = retryWorkflowSingleton({
      compose: () => composeSecond(clientModule, relationalDb),
      onComposed,
      logger: stubLogger(),
      intervalMs: 20,
    });
    try {
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(onComposed).not.toHaveBeenCalled();

      await holder.stop();

      await vi.waitFor(() => expect(onComposed).toHaveBeenCalledOnce());
      const [taken] = onComposed.mock.calls[0] as unknown as [
        ComposedWorkflowRuntime,
      ];
      expect(taken.singletonOwner).not.toBe(holder.singletonOwner);
      await taken.stop();
    } finally {
      await retry.stop();
    }
  });

  // Each claim builds its own runtime, so park state seeded under an earlier
  // claim never outlives the gap in which another holder wrote.
  it("reads the parks another holder wrote when it claims again", async () => {
    const clientModule = await buildReactorModule();
    const relationalDb = createRelationalDb(pglite()) as IRelationalDb;
    const engine = await import("@powerhousedao/reactor-workflow");
    const runtimes: WorkflowRuntimeService[] = [];
    const claim = (storageId: string) =>
      composeWorkflowRuntime({
        reactorClient: clientModule.client,
        clientModule: {} as InProcessReactorClientModule,
        relationalDb,
        attachments: {} as never,
        authorizationService: {} as never,
        logger: stubLogger(),
        storageId,
        load: () =>
          Promise.resolve({
            ...engine,
            createWorkflowRuntime: (host) => {
              const runtime = engine.createWorkflowRuntime(host);
              runtimes.push(runtime);
              return runtime;
            },
          }),
      });
    const parkOf = (runtime: WorkflowRuntimeService) =>
      (
        runtime as unknown as {
          parks: { get(id: string): Promise<unknown> };
        }
      ).parks.get("wf-gap");

    const first = await claim("/srv/slot-a");
    expect(await parkOf(runtimes[0]!)).toBeUndefined();
    await first.stop();

    const other = await claim("/srv/slot-b");
    await (await runtimes[1]!.store())!.parkWorkflow(
      "wf-gap",
      1,
      "parked by the other holder",
    );
    await other.stop();

    const again = await claim("/srv/slot-a");
    try {
      expect(runtimes[2]).not.toBe(runtimes[0]);
      expect(await parkOf(runtimes[2]!)).toMatchObject({
        reason: "parked by the other holder",
      });
    } finally {
      await again.stop();
    }
  });

  it("stops retrying the claim when the host stops", async () => {
    const clientModule = await buildReactorModule();
    const relationalDb = createRelationalDb(pglite()) as IRelationalDb;
    const holder = await compose(clientModule, {
      relationalDb,
      storageId: "/srv/slot-a",
    });
    const onComposed = vi.fn(() => Promise.resolve());
    const retry = retryWorkflowSingleton({
      compose: () => composeSecond(clientModule, relationalDb),
      onComposed,
      logger: stubLogger(),
      intervalMs: 20,
    });
    await new Promise((resolve) => setTimeout(resolve, 60));

    await retry.stop();
    await holder.stop();
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(onComposed).not.toHaveBeenCalled();
  });

  it("composes without a claim only when the host opts out", async () => {
    const clientModule = await buildReactorModule();
    const relationalDb = createRelationalDb(pglite()) as IRelationalDb;

    const unclaimed = await compose(clientModule, {
      relationalDb,
      singletonLease: false,
    });
    expect(unclaimed.singletonOwner).toBeUndefined();

    // Nothing was claimed, so a host that does claim takes it at once.
    const claimed = await composeSecond(clientModule, relationalDb);
    try {
      expect(claimed.singletonOwner).toBeDefined();
    } finally {
      await claimed.stop();
    }
  });
});

describe("the host's answer to losing the workflow singleton", () => {
  it("stays without workflows, naming the holder, when another claim took it", () => {
    const logger = stubLogger();
    const fatal = vi.fn(() => true);

    workflowSingletonLossHandler(
      logger,
      fatal,
    )({
      reason: "taken",
      heldBy: "switchboard-1",
    });

    expect(fatal).not.toHaveBeenCalled();
    const logged = vi
      .mocked(logger.error)
      .mock.calls.map(([line]) => String(line));
    expect(logged.join("\n")).toContain('Another process ("switchboard-1")');
  });

  // Nobody else runs workflows after a database blip: going down lets the
  // supervisor restart the process, which re-claims at boot.
  it("goes through the fatal shutdown when no takeover was seen", () => {
    const logger = stubLogger();
    const fatal = vi.fn(() => true);

    workflowSingletonLossHandler(
      logger,
      fatal,
    )({
      reason: "unrenewable",
      silentMs: 30_000,
    });

    expect(fatal).toHaveBeenCalledOnce();
    const [, error] = fatal.mock.calls[0] as unknown as [string, Error];
    expect(error.message).toContain("no other process was seen");
    expect(error.message).not.toContain("Another process");
  });

  it("says a restart is needed when no fatal shutdown is installed", () => {
    const logger = stubLogger();

    workflowSingletonLossHandler(
      logger,
      () => false,
    )({
      reason: "unrenewable",
      silentMs: 30_000,
    });

    const logged = vi
      .mocked(logger.error)
      .mock.calls.map(([line]) => String(line));
    expect(logged.join("\n")).toContain("until it is restarted");
    expect(logged.join("\n")).not.toContain("Another process");
  });
});

describe("the host's reactor access", () => {
  const signer = { app: { key: "did:key:zHost" }, user: { address: "0xhost" } };
  const moduleWith = (flags?: Record<string, boolean>) =>
    ({
      signer,
      reactorModule: flags ? { featureFlags: flags } : undefined,
    }) as unknown as InProcessReactorClientModule;

  it("grants the host by key under auth conditions, else by address", () => {
    const byKey = reactorAccessOf(
      moduleWith({ authEnforcement: true, authConditions: true }),
    );
    expect(byKey).toEqual({
      authEnforcement: true,
      authConditions: true,
      identity: { address: "0xhost", key: "did:key:zHost" },
    });
    expect(hostPrincipalOf(byKey)).toEqual({
      match: { eq: [{ attr: "subject.key" }, { lit: "did:key:zHost" }] },
    });

    const byAddress = reactorAccessOf(
      moduleWith({ authEnforcement: false, authConditions: false }),
    );
    expect(byAddress.authEnforcement).toBe(false);
    expect(hostPrincipalOf(byAddress)).toEqual({ address: "0xhost" });
  });

  it("reads unknown flags as enforced and a keyless signer as no identity", () => {
    const access = reactorAccessOf({
      signer: {},
      reactorModule: undefined,
    } as unknown as InProcessReactorClientModule);
    expect(access).toEqual({
      authEnforcement: true,
      authConditions: false,
      identity: null,
    });
    expect(hostPrincipalOf(access)).toBeUndefined();
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
      // With no worker pool or projection worker, workflows alone resolve them.
      expect(
        switchboard.modelManifest().map((entry) => entry.documentType),
      ).toEqual(
        expect.arrayContaining([
          "powerhouse/workflow",
          "powerhouse/connection",
        ]),
      );
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

  it("gives a piece two packages ship to the first by package name, whatever the load order", () => {
    const registry = new PieceRegistry();
    const source = stubSource(
      new Map([
        ["@zeta/pack", [entry("@acme/piece-a", "9.0.0")]],
        ["@alpha/pack", [entry("@acme/piece-a", "1.0.0")]],
      ]),
    );

    bindPackagePieces(registry, source);

    expect(registry.versions()).toEqual({ "@acme/piece-a": "1.0.0" });
  });
});
