import { documentModelDocumentModelModule } from "document-model";
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
import type {
  DbConfig,
  WorkerPoolConfig,
} from "../../src/executor/worker/protocol.js";

const WORKER_POOL_ENABLED: WorkerPoolConfig = {
  enabled: true,
  numWorkers: 1,
  workerType: "thread",
};

const WORKER_POOL_DISABLED: WorkerPoolConfig = {
  enabled: false,
  numWorkers: 1,
  workerType: "thread",
};

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
      const builder = new ReactorBuilder()
        .withWorkerPool(WORKER_POOL_ENABLED)
        .withWorkerFactory((index) => new FakeWorker(index));

      await expect(builder.buildModule()).rejects.toThrow(/worker-importable/);
    });

    it("rejects models registered only as live modules", async () => {
      const builder = new ReactorBuilder()
        .withDocumentModelSources([
          ...FIXTURE_SOURCES,
          documentModelDocumentModelModule,
        ])
        .withWorkerPool(WORKER_POOL_ENABLED)
        .withWorkerFactory((index) => new FakeWorker(index));

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
        .withWorkerPool(WORKER_POOL_ENABLED)
        .withWorkerFactory((index) => new FakeWorker(index));

      const module = await builder.buildModule();
      try {
        expect(builder.getResolvedModelManifest()).toHaveLength(1);
      } finally {
        await module.reactor.kill();
      }
    });

    it("does not restrict live modules when the pool is disabled", async () => {
      const builder = new ReactorBuilder()
        .withDocumentModelSources([documentModelDocumentModelModule])
        .withWorkerPool(WORKER_POOL_DISABLED);

      const module = await builder.buildModule();
      module.reactor.kill();

      expect(builder.getResolvedModelManifest()).toBeUndefined();
    });

    it("rejects when enabled and withWorkerDbConfig is missing (default factory)", async () => {
      const builder = new ReactorBuilder()
        .withDocumentModelSources(FIXTURE_SOURCES)
        .withWorkerPool(WORKER_POOL_ENABLED);

      await expect(builder.buildModule()).rejects.toThrow(/withWorkerDbConfig/);
    });

    it("builds without a signature-verifier spec (verification is optional)", async () => {
      const builder = new ReactorBuilder()
        .withDocumentModelSources(FIXTURE_SOURCES)
        .withWorkerPool(WORKER_POOL_ENABLED)
        .withWorkerFactory((index) => new FakeWorker(index));

      const module = await builder.buildModule();
      try {
        const status = module.executorManager.getStatus();
        expect(status.numExecutors).toBe(WORKER_POOL_ENABLED.numWorkers);
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
      const config: WorkerPoolConfig = {
        enabled: true,
        numWorkers: 3,
        workerType: "thread",
      };
      const builder = new ReactorBuilder()
        .withDocumentModelSources(FIXTURE_SOURCES)
        .withWorkerPool(config)
        .withWorkerFactory(factory);

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
        .withWorkerPool(WORKER_POOL_ENABLED)
        .withWorkerFactory(factory)
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

    it("routes parent database through createPostgresDatabase when workerPool.enabled and workerDbConfig is set", async () => {
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
          .withWorkerPool(WORKER_POOL_ENABLED)
          .withWorkerFactory(factory)
          .withWorkerDbConfig(TEST_DB_CONFIG);

        await expect(builder.buildModule()).rejects.toThrow(
          /postgres-was-called/,
        );
        expect(spy).toHaveBeenCalledWith(TEST_DB_CONFIG);
      } finally {
        spy.mockRestore();
      }
    });

    it("uses PGlite default when workerPool.enabled but no workerDbConfig (custom factory path)", async () => {
      const proto = ReactorBuilder.prototype as unknown as {
        createPostgresDatabase: (config: DbConfig) => Promise<unknown>;
      };
      const spy = vi.spyOn(proto, "createPostgresDatabase");

      try {
        const factory = (index: number) => new FakeWorker(index);
        const builder = new ReactorBuilder()
          .withDocumentModelSources(FIXTURE_SOURCES)
          .withWorkerPool(WORKER_POOL_ENABLED)
          .withWorkerFactory(factory);

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

    it("falls back to SimpleJobExecutorManager when workerPool is disabled", async () => {
      const builder = new ReactorBuilder()
        .withDocumentModelSources(FIXTURE_SOURCES)
        .withWorkerPool(WORKER_POOL_DISABLED);

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
});
