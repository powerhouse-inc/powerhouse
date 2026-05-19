import { afterEach, describe, expect, it } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { DocumentModelSpecInput } from "../../src/core/reactor-builder.js";
import type { WorkerPoolConfig } from "../../src/executor/worker/protocol.js";

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
});
