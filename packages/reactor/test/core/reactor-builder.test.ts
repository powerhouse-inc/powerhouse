import { describe, expect, it, vi } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { DocumentModelSpecInput } from "../../src/core/reactor-builder.js";
import type {
  IExecutorWorker,
  WorkerExecutionOutcome,
  WorkerInFlightSnapshot,
} from "../../src/executor/interfaces.js";
import type { Job } from "../../src/queue/types.js";
import type {
  DbConfig,
  SignatureVerifierSpec,
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

const TEST_VERIFIER_SPEC: SignatureVerifierSpec = {
  module: { packageName: "test-verifier", exportName: "factory" },
};

const TEST_SPECS: DocumentModelSpecInput[] = [
  { packageName: "ph/test-model", version: "1.0.0" },
];

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
  describe("withDocumentModels (in-process path)", () => {
    it("builds successfully without withDocumentModelSpecs; manifest is undefined", async () => {
      const builder = new ReactorBuilder();
      const module = await builder.buildModule();
      module.reactor.kill();

      expect(builder.getResolvedModelManifest()).toBeUndefined();
    });
  });

  describe("withDocumentModelSpecs", () => {
    it("populates the resolved manifest with correct ModuleRef discriminants", async () => {
      const specs: DocumentModelSpecInput[] = [
        { packageName: "x", version: "1.0.0" },
        { filePath: "/tmp/x.js" },
      ];
      const builder = new ReactorBuilder().withDocumentModelSpecs(specs);

      const module = await builder.buildModule();
      module.reactor.kill();

      const manifest = builder.getResolvedModelManifest();
      expect(manifest).toHaveLength(2);

      const [pkgEntry, fileEntry] = manifest!;

      expect("packageName" in pkgEntry.spec.module).toBe(true);
      if ("packageName" in pkgEntry.spec.module) {
        expect(pkgEntry.spec.module.packageName).toBe("x");
        expect(pkgEntry.spec.module.exportName).toBe("documentModel");
      }
      expect(pkgEntry.version).toBe("1.0.0");

      expect("filePath" in fileEntry.spec.module).toBe(true);
      if ("filePath" in fileEntry.spec.module) {
        expect(fileEntry.spec.module.filePath).toBe("/tmp/x.js");
        expect(fileEntry.spec.module.exportName).toBe("documentModel");
      }
    });

    it("carries an explicit exportName through to the manifest", async () => {
      const specs: DocumentModelSpecInput[] = [
        { packageName: "x", version: "1.0.0", exportName: "accountModel" },
        { filePath: "/tmp/barrel.js", exportName: "invoiceModel" },
      ];
      const builder = new ReactorBuilder().withDocumentModelSpecs(specs);

      const module = await builder.buildModule();
      module.reactor.kill();

      const manifest = builder.getResolvedModelManifest();
      expect(manifest).toHaveLength(2);
      expect(manifest![0].spec.module.exportName).toBe("accountModel");
      expect(manifest![1].spec.module.exportName).toBe("invoiceModel");
    });
  });

  describe("mutual-exclusion validation", () => {
    it("rejects when withDocumentModels and workerPool.enabled are both set", async () => {
      const builder = new ReactorBuilder()
        .withDocumentModels([{} as any])
        .withWorkerPool(WORKER_POOL_ENABLED);

      await expect(builder.buildModule()).rejects.toThrow(
        /withDocumentModelSpecs/,
      );
    });

    it("rejects when workerPool.enabled is true but no specs registered", async () => {
      const builder = new ReactorBuilder().withWorkerPool(WORKER_POOL_ENABLED);

      await expect(builder.buildModule()).rejects.toThrow(
        /withDocumentModelSpecs/,
      );
    });

    it("does not throw when workerPool.enabled is false and withDocumentModels is used", async () => {
      const builder = new ReactorBuilder()
        .withDocumentModels([{} as any])
        .withWorkerPool(WORKER_POOL_DISABLED);

      const module = await builder.buildModule();
      module.reactor.kill();

      expect(builder.getResolvedModelManifest()).toBeUndefined();
    });
  });

  describe("worker-pool wiring", () => {
    it("rejects when enabled and withWorkerDbConfig is missing", async () => {
      const builder = new ReactorBuilder()
        .withDocumentModelSpecs(TEST_SPECS)
        .withWorkerPool(WORKER_POOL_ENABLED)
        .withWorkerSignatureVerifierSpec(TEST_VERIFIER_SPEC);

      await expect(builder.buildModule()).rejects.toThrow(/withWorkerDbConfig/);
    });

    it("rejects when enabled and withWorkerSignatureVerifierSpec is missing", async () => {
      const builder = new ReactorBuilder()
        .withDocumentModelSpecs(TEST_SPECS)
        .withWorkerPool(WORKER_POOL_ENABLED)
        .withWorkerDbConfig(TEST_DB_CONFIG);

      await expect(builder.buildModule()).rejects.toThrow(
        /withWorkerSignatureVerifierSpec/,
      );
    });

    it("skips db / verifier validation when withWorkerFactory is provided", async () => {
      const factory = (index: number) => new FakeWorker(index);
      const builder = new ReactorBuilder()
        .withDocumentModelSpecs(TEST_SPECS)
        .withWorkerPool(WORKER_POOL_ENABLED)
        .withWorkerFactory(factory);

      const module = await builder.buildModule();
      try {
        const status = module.executorManager.getStatus();
        expect(status.numExecutors).toBe(WORKER_POOL_ENABLED.numWorkers);
        expect(module.executorManager.getExecutors()).toEqual([]);
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
        .withDocumentModelSpecs(TEST_SPECS)
        .withWorkerPool(config)
        .withWorkerFactory(factory);

      const module = await builder.buildModule();
      try {
        expect(created).toHaveLength(3);
        for (const w of created) {
          expect(w.startCalls).toBe(1);
          expect(w.index).toBeGreaterThanOrEqual(0);
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
        .withDocumentModelSpecs(TEST_SPECS)
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
          .withDocumentModelSpecs(TEST_SPECS)
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
          .withDocumentModelSpecs(TEST_SPECS)
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
        .withDocumentModelSpecs(TEST_SPECS)
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
