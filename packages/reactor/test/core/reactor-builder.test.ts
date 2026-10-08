import { documentModelDocumentModelModule } from "document-model";
import type { ILogger } from "document-model";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { DocumentModelSource } from "../../src/core/reactor-builder.js";
import type {
  IExecutorWorker,
  WorkerExecutionOutcome,
  WorkerInFlightSnapshot,
} from "../../src/executor/interfaces.js";
import type { Job } from "../../src/queue/types.js";
import type { IReactor } from "../../src/core/types.js";
import type {
  DbConfig,
  ModelManifestEntry,
} from "../../src/executor/worker/protocol.js";
import type { IReadModel } from "../../src/read-models/interfaces.js";
import type { IChannelFactory } from "../../src/sync/interfaces.js";
import { SyncBuilder } from "../../src/sync/sync-builder.js";
import { ChannelScheme } from "../../src/sync/types.js";

/** An ILogger that keeps what it was handed, so the report can be asserted. */
function recordingLogger(): ILogger & {
  errors: unknown[][];
  warns: unknown[][];
} {
  const errors: unknown[][] = [];
  const warns: unknown[][] = [];
  const noop = () => undefined;
  const logger = {
    level: "error",
    verbose: noop,
    debug: noop,
    info: noop,
    warn: (...args: unknown[]) => void warns.push(args),
    error: (...args: unknown[]) => void errors.push(args),
    errorHandler: noop,
    child: () => logger,
    errors,
    warns,
  };
  return logger as unknown as ILogger & {
    errors: unknown[][];
    warns: unknown[][];
  };
}

const TEST_DB_CONFIG: DbConfig = {
  host: "localhost",
  port: 5432,
  database: "test",
  user: "test",
  password: "test",
};

const FIXTURE_PATH = fileURLToPath(
  new URL("./fixtures/model-barrel.mjs", import.meta.url),
);

const FIXTURE_SOURCES: DocumentModelSource[] = [{ filePath: FIXTURE_PATH }];

class FakeWorker implements IExecutorWorker {
  readonly workerId: string;
  readonly index: number;
  startCalls = 0;
  shutdownCalls = 0;

  constructor(index: number) {
    this.index = index;
    this.workerId = `fake-${index}`;
  }

  start(): Promise<void> {
    this.startCalls++;
    return Promise.resolve();
  }

  execute(_job: Job): Promise<WorkerExecutionOutcome> {
    return Promise.resolve({
      result: { job: _job, success: true, duration: 1 },
    });
  }

  abort(): void {}

  shutdown(): Promise<void> {
    this.shutdownCalls++;
    return Promise.resolve();
  }

  loadModel(): Promise<void> {
    return Promise.resolve();
  }

  evictPurged(): void {}

  isIdle(): boolean {
    return true;
  }

  getInFlight(): WorkerInFlightSnapshot | null {
    return null;
  }
}

describe("ReactorBuilder", () => {
  describe("withDocumentModelSources", () => {
    it("builds with no sources; manifest is undefined", async () => {
      const builder = new ReactorBuilder();
      const module = await builder.buildModule();
      module.reactor.kill();

      expect(builder.getResolvedModelManifest()).toBeUndefined();
    });

    it("registers live-module sources on the registry without a manifest", async () => {
      const builder = new ReactorBuilder().withDocumentModelSources([
        documentModelDocumentModelModule,
      ]);

      const module = await builder.buildModule();
      try {
        const registered = module.documentModelRegistry.getModule(
          documentModelDocumentModelModule.documentModel.global.id,
        );
        expect(registered).toBeDefined();
        expect(builder.getResolvedModelManifest()).toBeUndefined();
      } finally {
        module.reactor.kill();
      }
    });

    it("resolves a file source: scans exports into registry and manifest", async () => {
      const builder = new ReactorBuilder().withDocumentModelSources(
        FIXTURE_SOURCES,
      );

      const module = await builder.buildModule();
      try {
        expect(
          module.documentModelRegistry.getModule("test/alpha"),
        ).toBeDefined();
        expect(
          module.documentModelRegistry.getModule("test/beta", 2),
        ).toBeDefined();

        const manifest = builder.getResolvedModelManifest();
        expect(manifest).toHaveLength(2);
        const byType = new Map(manifest!.map((e) => [e.documentType, e]));
        const alpha = byType.get("test/alpha")!;
        expect(alpha.version).toBe("1");
        expect(alpha.spec.module).toEqual({
          filePath: FIXTURE_PATH,
          exportName: "alphaModel",
        });
        const beta = byType.get("test/beta")!;
        expect(beta.version).toBe("2");
        expect(beta.spec.module).toEqual({
          filePath: FIXTURE_PATH,
          exportName: "betaModel",
        });
      } finally {
        module.reactor.kill();
      }
    });

    it("narrows a file source to a single model with an explicit exportName", async () => {
      const builder = new ReactorBuilder().withDocumentModelSources([
        { filePath: FIXTURE_PATH, exportName: "alphaModel" },
      ]);

      const module = await builder.buildModule();
      try {
        const manifest = builder.getResolvedModelManifest();
        expect(manifest).toHaveLength(1);
        expect(manifest![0].documentType).toBe("test/alpha");
      } finally {
        module.reactor.kill();
      }
    });

    it("resolves a package source by specifier", async () => {
      const builder = new ReactorBuilder().withDocumentModelSources([
        {
          packageName: "document-model",
          exportName: "documentModelDocumentModelModule",
        },
      ]);

      const module = await builder.buildModule();
      try {
        const manifest = builder.getResolvedModelManifest();
        expect(manifest).toHaveLength(1);
        expect(manifest![0].spec.module).toEqual({
          packageName: "document-model",
          exportName: "documentModelDocumentModelModule",
        });
        expect(
          module.documentModelRegistry.getModule(manifest![0].documentType),
        ).toBeDefined();
      } finally {
        module.reactor.kill();
      }
    });

    it("dedupes by documentType@version: importable source backfills a live module", async () => {
      const builder = new ReactorBuilder()
        .withDocumentModelSources([documentModelDocumentModelModule])
        .withDocumentModelSources([
          {
            packageName: "document-model",
            exportName: "documentModelDocumentModelModule",
          },
        ]);

      const module = await builder.buildModule();
      try {
        const manifest = builder.getResolvedModelManifest();
        expect(manifest).toHaveLength(1);
      } finally {
        module.reactor.kill();
      }
    });

    it("rejects an unimportable file source", async () => {
      const builder = new ReactorBuilder().withDocumentModelSources([
        { filePath: "/tmp/definitely-does-not-exist.mjs" },
      ]);

      await expect(builder.buildModule()).rejects.toThrow(/Failed to import/);
    });

    it("rejects a file source with no model exports", async () => {
      const builder = new ReactorBuilder().withDocumentModelSources([
        { filePath: FIXTURE_PATH, exportName: "notAModel" },
      ]);

      await expect(builder.buildModule()).rejects.toThrow(
        /not a DocumentModelModule/,
      );
    });
  });

  describe("worker-pool validation", () => {
    it("rejects when enabled with no importable sources", async () => {
      const builder = new ReactorBuilder().withWorkerPool({
        numWorkers: 1,
        factory: (index) => new FakeWorker(index),
      });

      await expect(builder.buildModule()).rejects.toThrow(/worker-importable/);
    });

    it("rejects models registered only as live modules", async () => {
      const builder = new ReactorBuilder()
        .withDocumentModelSources([
          ...FIXTURE_SOURCES,
          documentModelDocumentModelModule,
        ])
        .withWorkerPool({
          numWorkers: 1,
          factory: (index) => new FakeWorker(index),
        });

      await expect(builder.buildModule()).rejects.toThrow(
        /only as live modules.*powerhouse\/document-model/,
      );
    });

    it("accepts a live module when an importable source covers the same model", async () => {
      const builder = new ReactorBuilder()
        .withDocumentModelSources([
          documentModelDocumentModelModule,
          {
            packageName: "document-model",
            exportName: "documentModelDocumentModelModule",
          },
        ])
        .withWorkerPool({
          numWorkers: 1,
          factory: (index) => new FakeWorker(index),
        });

      const module = await builder.buildModule();
      try {
        expect(builder.getResolvedModelManifest()).toHaveLength(1);
      } finally {
        await module.reactor.kill();
      }
    });

    it("does not restrict live modules when no pool is configured", async () => {
      const builder = new ReactorBuilder().withDocumentModelSources([
        documentModelDocumentModelModule,
      ]);

      const module = await builder.buildModule();
      module.reactor.kill();

      expect(builder.getResolvedModelManifest()).toBeUndefined();
    });

    it("builds a worker pool from a thread count and a factory", async () => {
      const builder = new ReactorBuilder()
        .withDocumentModelSources(FIXTURE_SOURCES)
        .withWorkerPool({
          numWorkers: 1,
          factory: (index) => new FakeWorker(index),
        });

      const module = await builder.buildModule();
      try {
        const status = module.executorManager.getStatus();
        expect(status.numExecutors).toBe(1);
      } finally {
        await module.reactor.kill();
      }
    });

    it("invokes the injected factory once per worker (numWorkers from config)", async () => {
      const created: FakeWorker[] = [];
      const factory = (index: number) => {
        const w = new FakeWorker(index);
        created.push(w);
        return w;
      };
      const builder = new ReactorBuilder()
        .withDocumentModelSources(FIXTURE_SOURCES)
        .withWorkerPool({ numWorkers: 3, factory });

      const module = await builder.buildModule();
      try {
        expect(created).toHaveLength(3);
        for (const w of created) {
          expect(w.startCalls).toBe(1);
          expect(w.index).toBeLessThan(3);
        }
        expect(module.executorManager.getStatus().numExecutors).toBe(3);
      } finally {
        await module.reactor.kill();
      }

      for (const w of created) {
        expect(w.shutdownCalls).toBeGreaterThan(0);
      }
    });

    it("does not invoke the worker factory when withExecutor injects a manager", async () => {
      let factoryCalls = 0;
      const factory = (index: number) => {
        factoryCalls++;
        return new FakeWorker(index);
      };

      const customManagerCalls = { start: 0, stop: 0 };
      const customManager = {
        start(): Promise<void> {
          customManagerCalls.start++;
          return Promise.resolve();
        },
        stop(): Promise<void> {
          customManagerCalls.stop++;
          return Promise.resolve();
        },
        getExecutors() {
          return [];
        },
        getStatus() {
          return {
            isRunning: true,
            numExecutors: 0,
            activeJobs: 0,
            totalJobsProcessed: 0,
          };
        },
      };

      const builder = new ReactorBuilder()
        .withDocumentModelSources(FIXTURE_SOURCES)
        .withWorkerPool({ numWorkers: 1, factory })
        .withExecutor(customManager);

      const module = await builder.buildModule();
      try {
        expect(factoryCalls).toBe(0);
        expect(customManagerCalls.start).toBe(1);
        expect(module.executorManager).toBe(customManager);
      } finally {
        await module.reactor.kill();
      }
    });

    it("routes parent database through createPostgresDatabase when the pool carries a db", async () => {
      const proto = ReactorBuilder.prototype as unknown as {
        createPostgresDatabase: (config: DbConfig) => Promise<unknown>;
      };
      const spy = vi
        .spyOn(proto, "createPostgresDatabase")
        .mockRejectedValue(new Error("postgres-was-called"));

      try {
        const factory = (index: number) => new FakeWorker(index);
        const builder = new ReactorBuilder()
          .withDocumentModelSources(FIXTURE_SOURCES)
          .withWorkerPool({ numWorkers: 1, db: TEST_DB_CONFIG, factory });

        await expect(builder.buildModule()).rejects.toThrow(
          /postgres-was-called/,
        );
        expect(spy).toHaveBeenCalledWith(TEST_DB_CONFIG);
      } finally {
        spy.mockRestore();
      }
    });

    it("uses PGlite default when the pool has a factory but no db", async () => {
      const proto = ReactorBuilder.prototype as unknown as {
        createPostgresDatabase: (config: DbConfig) => Promise<unknown>;
      };
      const spy = vi.spyOn(proto, "createPostgresDatabase");

      try {
        const factory = (index: number) => new FakeWorker(index);
        const builder = new ReactorBuilder()
          .withDocumentModelSources(FIXTURE_SOURCES)
          .withWorkerPool({ numWorkers: 1, factory });

        const module = await builder.buildModule();
        try {
          expect(spy).not.toHaveBeenCalled();
        } finally {
          await module.reactor.kill();
        }
      } finally {
        spy.mockRestore();
      }
    });

    it("falls back to SimpleJobExecutorManager when no pool is configured", async () => {
      const builder = new ReactorBuilder().withDocumentModelSources(
        FIXTURE_SOURCES,
      );

      const module = await builder.buildModule();
      try {
        const status = module.executorManager.getStatus();
        expect(status.isRunning).toBe(true);
        expect(module.executorManager.getExecutors().length).toBeGreaterThan(0);
      } finally {
        await module.reactor.kill();
      }
    });
  });

  describe("database configuration", () => {
    it("builds the parent from the projection-shard db so reads and writes cannot diverge", async () => {
      const proto = ReactorBuilder.prototype as unknown as {
        createPostgresDatabase: (config: DbConfig) => Promise<unknown>;
      };
      const spy = vi
        .spyOn(proto, "createPostgresDatabase")
        .mockRejectedValue(new Error("postgres-was-called"));

      try {
        const builder = new ReactorBuilder()
          .withDocumentModelSources(FIXTURE_SOURCES)
          .withProjectionShards({
            db: TEST_DB_CONFIG,
            shardCount: 1,
            preReadyKinds: ["document-view", "document-indexer"],
            postReadyKinds: [],
          });

        await expect(builder.buildModule()).rejects.toThrow(
          /postgres-was-called/,
        );
        expect(spy).toHaveBeenCalledWith(TEST_DB_CONFIG);
      } finally {
        spy.mockRestore();
      }
    });

    it("refuses shardCount 2", async () => {
      const builder = new ReactorBuilder()
        .withDocumentModelSources(FIXTURE_SOURCES)
        .withProjectionShards({
          db: TEST_DB_CONFIG,
          shardCount: 2,
          preReadyKinds: ["document-view", "document-indexer"],
          postReadyKinds: [],
        });

      await expect(builder.buildModule()).rejects.toThrow(
        "shardCount 2 is not supported: read-side catch-up keeps one cursor per read model, so projection runs in exactly one worker (shardCount: 1)",
      );
    });

    it("rejects a worker pool and projection shards pointed at different databases", async () => {
      const builder = new ReactorBuilder()
        .withDocumentModelSources(FIXTURE_SOURCES)
        .withWorkerPool({
          numWorkers: 1,
          db: TEST_DB_CONFIG,
          factory: (index) => new FakeWorker(index),
        })
        .withProjectionShards({
          db: { ...TEST_DB_CONFIG, host: "other-host" },
          shardCount: 1,
          preReadyKinds: ["document-view", "document-indexer"],
          postReadyKinds: [],
        });

      await expect(builder.buildModule()).rejects.toThrow(
        /must address the same Postgres database/,
      );
    });

    it("accepts a worker pool and projection shards on the same database", async () => {
      const proto = ReactorBuilder.prototype as unknown as {
        createPostgresDatabase: (config: DbConfig) => Promise<unknown>;
      };
      const spy = vi
        .spyOn(proto, "createPostgresDatabase")
        .mockRejectedValue(new Error("postgres-was-called"));

      try {
        const builder = new ReactorBuilder()
          .withDocumentModelSources(FIXTURE_SOURCES)
          .withWorkerPool({
            numWorkers: 1,
            db: TEST_DB_CONFIG,
            factory: (index) => new FakeWorker(index),
          })
          .withProjectionShards({
            db: { ...TEST_DB_CONFIG, poolSize: 9 },
            shardCount: 1,
            preReadyKinds: ["document-view", "document-indexer"],
            postReadyKinds: [],
          });

        await expect(builder.buildModule()).rejects.toThrow(
          /postgres-was-called/,
        );
        expect(spy).toHaveBeenCalledWith(TEST_DB_CONFIG);
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe("projection-shard read-model coverage", () => {
    /**
     * Every case here asserts the guard fires before createPostgresDatabase:
     * a config that names no owner for a built-in read model must not get
     * far enough to open a pool, spawn a worker, or reach startup().
     */
    function spyOnPostgres() {
      const proto = ReactorBuilder.prototype as unknown as {
        createPostgresDatabase: (config: DbConfig) => Promise<unknown>;
      };
      return vi
        .spyOn(proto, "createPostgresDatabase")
        .mockRejectedValue(new Error("postgres-was-called"));
    }

    it("rejects a config that leaves a built-in read model to no shard", async () => {
      const spy = spyOnPostgres();
      try {
        const builder = new ReactorBuilder()
          .withDocumentModelSources(FIXTURE_SOURCES)
          .withProjectionShards({
            db: TEST_DB_CONFIG,
            shardCount: 1,
            preReadyKinds: ["document-view"],
            postReadyKinds: [],
          });

        await expect(builder.buildModule()).rejects.toThrow(
          /never named: document-indexer/,
        );
        expect(spy).not.toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    });

    it("rejects a config that names no read models at all", async () => {
      const spy = spyOnPostgres();
      try {
        const builder = new ReactorBuilder()
          .withDocumentModelSources(FIXTURE_SOURCES)
          .withProjectionShards({
            db: TEST_DB_CONFIG,
            shardCount: 1,
            preReadyKinds: [],
            postReadyKinds: [],
          });

        await expect(builder.buildModule()).rejects.toThrow(
          /never named: document-view, document-indexer/,
        );
        expect(spy).not.toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    });

    it("rejects a read model named on both sides of READ_READY", async () => {
      const spy = spyOnPostgres();
      try {
        const builder = new ReactorBuilder()
          .withDocumentModelSources(FIXTURE_SOURCES)
          .withProjectionShards({
            db: TEST_DB_CONFIG,
            shardCount: 1,
            preReadyKinds: ["document-view", "document-indexer"],
            postReadyKinds: ["document-view"],
          });

        await expect(builder.buildModule()).rejects.toThrow(
          /named more than once: document-view/,
        );
        expect(spy).not.toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    });

    it("accepts full coverage split across pre- and post-READ_READY", async () => {
      const spy = spyOnPostgres();
      try {
        const builder = new ReactorBuilder()
          .withDocumentModelSources(FIXTURE_SOURCES)
          .withProjectionShards({
            db: TEST_DB_CONFIG,
            shardCount: 1,
            preReadyKinds: ["document-view"],
            postReadyKinds: ["document-indexer"],
          });

        await expect(builder.buildModule()).rejects.toThrow(
          /postgres-was-called/,
        );
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe("withReadModelFactory", () => {
    it("reports a failing read model by name and still builds the reactor", async () => {
      const healthy: IReadModel = {
        name: "healthy-read-model",
        indexOperations: () => Promise.resolve(),
      };
      const second = vi.fn(() => healthy);
      const logger = recordingLogger();

      // Named so the report can say which factory failed: a factory carries no
      // id, and a failure has no instance to ask for one.
      const buildAttachmentReferences = async (): Promise<IReadModel> => {
        // Read model factories own catch-up, so init failures surface here.
        const broken = {
          name: "broken-read-model",
          indexOperations: () => Promise.resolve(),
          init: () => Promise.reject(new Error("read model init failed")),
        } satisfies IReadModel & { init: () => Promise<void> };
        await broken.init();
        return broken;
      };

      const builder = new ReactorBuilder()
        .withLogger(logger)
        .withReadModelFactory(buildAttachmentReferences)
        .withReadModelFactory(second);

      const module = await builder.buildModule();
      module.reactor.kill();

      // The reactor is up, so the failure must be legible from the outside --
      // otherwise it is only discoverable as reads that answer from an index
      // that stopped at boot.
      expect(module.degradedComponents).toEqual([
        {
          component: "read model 0 (buildAttachmentReferences)",
          error: expect.objectContaining({
            message: "read model init failed",
          }),
        },
      ]);
      expect(
        logger.errors.some(
          ([message, component]) =>
            typeof message === "string" &&
            message.includes("degraded") &&
            component === "read model 0 (buildAttachmentReferences)",
        ),
      ).toBe(true);

      // The failure is contained per factory: later ones still register.
      expect(second).toHaveBeenCalledTimes(1);
    });

    it("reports nothing degraded on a clean build", async () => {
      const healthy: IReadModel = {
        name: "healthy-read-model",
        indexOperations: () => Promise.resolve(),
      };
      const builder = new ReactorBuilder()
        .withLogger(recordingLogger())
        .withReadModelFactory(() => healthy);

      const module = await builder.buildModule();
      module.reactor.kill();

      expect(module.degradedComponents).toEqual([]);
    });
  });

  describe("getImportableEntries", () => {
    class LoadingWorker extends FakeWorker {
      readonly loaded: ModelManifestEntry[] = [];
      override loadModel(entry?: ModelManifestEntry): Promise<void> {
        if (entry) this.loaded.push(entry);
        return Promise.resolve();
      }
    }

    const betaLoader = {
      load: () =>
        Promise.resolve({ filePath: FIXTURE_PATH, exportName: "betaModel" }),
    };

    const betaEntry: ModelManifestEntry = {
      documentType: "test/beta",
      version: "2",
      spec: { module: { filePath: FIXTURE_PATH, exportName: "betaModel" } },
    };

    // A type the boot sources leave out, so creating one runs the loader.
    async function loadBeta(reactor: IReactor): Promise<void> {
      const document = documentModelDocumentModelModule.utils.createDocument();
      document.header.documentType = "test/beta";
      await reactor.create(document);
    }

    it("lists boot entries, and run-time loads beside the pool's broadcast", async () => {
      const workers: LoadingWorker[] = [];
      const builder = new ReactorBuilder()
        .withDocumentModelSources([
          { filePath: FIXTURE_PATH, exportName: "alphaModel" },
        ])
        .withDocumentModelLoader(betaLoader)
        .withWorkerPool({
          numWorkers: 1,
          factory: (index) => {
            const worker = new LoadingWorker(index);
            workers.push(worker);
            return worker;
          },
        });

      const module = await builder.buildModule();
      try {
        expect(
          builder.getImportableEntries("test/alpha").map((e) => e.version),
        ).toEqual(["1"]);
        expect(builder.getImportableEntries("test/beta")).toEqual([]);

        await loadBeta(module.reactor);

        expect(builder.getImportableEntries("test/beta")).toEqual([betaEntry]);
        expect(workers[0]!.loaded).toEqual([betaEntry]);
        expect(builder.getResolvedModelManifest()).toHaveLength(1);
      } finally {
        await module.reactor.kill();
      }
    });

    it("lists run-time loads without a pool", async () => {
      const builder = new ReactorBuilder()
        .withDocumentModelSources([documentModelDocumentModelModule])
        .withDocumentModelLoader(betaLoader);
      const module = await builder.buildModule();
      try {
        await loadBeta(module.reactor);

        expect(builder.getImportableEntries("test/beta")).toEqual([betaEntry]);
      } finally {
        await module.reactor.kill();
      }
    });

    it("lists boot entries without a loader", async () => {
      const builder = new ReactorBuilder().withDocumentModelSources([
        { filePath: FIXTURE_PATH, exportName: "alphaModel" },
      ]);
      const module = await builder.buildModule();
      try {
        expect(
          builder.getImportableEntries("test/alpha").map((e) => e.documentType),
        ).toEqual(["test/alpha"]);
      } finally {
        await module.reactor.kill();
      }
    });
  });

  describe("sync configuration", () => {
    const unusedFactory: IChannelFactory = {
      instance: () => {
        throw new Error("not reached");
      },
    };

    it("refuses withChannelScheme together with withSync", async () => {
      const builder = new ReactorBuilder()
        .withLogger(recordingLogger())
        .withChannelScheme(ChannelScheme.CONNECT)
        .withSync(new SyncBuilder().withChannelFactory(unusedFactory));

      await expect(builder.buildModule()).rejects.toThrow(
        "withChannelScheme and withSync are mutually exclusive",
      );
    });

    it("refuses the combination whichever order it was set in", async () => {
      const builder = new ReactorBuilder()
        .withLogger(recordingLogger())
        .withSync(new SyncBuilder().withChannelFactory(unusedFactory))
        .withChannelScheme(ChannelScheme.SWITCHBOARD);

      await expect(builder.build()).rejects.toThrow(
        "withChannelScheme and withSync are mutually exclusive",
      );
    });

    it("builds the scheme's sync module from withChannelScheme alone", async () => {
      const module = await new ReactorBuilder()
        .withLogger(recordingLogger())
        .withChannelScheme(ChannelScheme.SWITCHBOARD)
        .buildModule();

      try {
        expect(module.syncModule).toBeDefined();
      } finally {
        module.syncModule?.syncManager.shutdown();
        module.reactor.kill();
      }
    });

    it("builds the caller's SyncBuilder from withSync alone", async () => {
      const syncBuilder = new SyncBuilder().withChannelFactory(unusedFactory);
      const buildSpy = vi.spyOn(syncBuilder, "buildModule");

      const module = await new ReactorBuilder()
        .withLogger(recordingLogger())
        .withSync(syncBuilder)
        .buildModule();

      try {
        expect(buildSpy).toHaveBeenCalledTimes(1);
        expect(module.syncModule).toBe(buildSpy.mock.results[0]?.value);
      } finally {
        module.syncModule?.syncManager.shutdown();
        module.reactor.kill();
      }
    });
  });
});
