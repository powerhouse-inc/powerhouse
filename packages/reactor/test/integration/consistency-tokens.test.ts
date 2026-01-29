import { EventBus } from "#index.js";
import { MemoryStorage, driveDocumentModelModule } from "document-drive";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { IReactor } from "../../src/core/types.js";
import type { ConsistencyToken, JobInfo } from "../../src/shared/types.js";
import { JobStatus } from "../../src/shared/types.js";
import { createDocModelDocument } from "../factories.js";
import { TestReadModelCoordinator } from "../utils/test-read-model-coordinator.js";

describe("Consistency Tokens with Document View", () => {
  let reactor: IReactor;
  let storage: MemoryStorage;
  let testCoordinator: TestReadModelCoordinator;

  async function waitForJobCompletion(jobId: string): Promise<JobInfo> {
    await vi.waitUntil(
      async () => {
        const status = await reactor.getJobStatus(jobId);
        if (status.status === JobStatus.FAILED) {
          status.errorHistory?.forEach((error, index) => {
            console.error(`[Attempt ${index + 1}] ${error.message}`);
            console.error(
              `[Attempt ${index + 1}] Stack trace:\n${error.stack}`,
            );
          });

          throw new Error(status.error?.message || "Job failed");
        }

        return (
          status.status === JobStatus.READ_READY ||
          status.status === JobStatus.WRITE_READY
        );
      },
      { timeout: 5000 },
    );

    return await reactor.getJobStatus(jobId);
  }

  beforeEach(async () => {
    storage = new MemoryStorage();

    const eventBus = new EventBus();
    testCoordinator = new TestReadModelCoordinator(eventBus);

    const builder = new ReactorBuilder()
      .withDocumentModels([
        documentModelDocumentModelModule as any,
        driveDocumentModelModule as any,
      ])
      .withEventBus(eventBus)
      .withLegacyStorage(storage)
      .withFeatures({ legacyStorageEnabled: false })
      .withReadModelCoordinator(testCoordinator);

    const module = await builder.buildModule();
    testCoordinator.readModels.push(module.documentIndexer);
    testCoordinator.readModels.push(module.documentView);

    reactor = module.reactor;
  });

  afterEach(() => {
    reactor.kill();
  });

  describe("Basic read-after-write consistency", () => {
    it("should wait for read model updates before returning query results", async () => {
      // this will accumulate the write updates so the read models don't index them yet
      testCoordinator.pause();

      const doc = createDocModelDocument({ id: "doc-1" });
      const jobInfo = await reactor.create(doc);

      const completedJob = await waitForJobCompletion(jobInfo.id);
      const consistencyToken = completedJob.consistencyToken;

      // make the request while we are sure the read model has NOT indexed the operation yet
      const queryPromise = reactor.get("doc-1", undefined, consistencyToken);

      // now flush the write updates -- the read models will get these and index them
      // we are not awaiting here, because we want to test that the other promise is
      // awaiting properly
      testCoordinator.flush().catch((error) => {
        throw error;
      });

      // now we await the query promise, which should wait for the read model to index the operation
      const result = await queryPromise;
      expect(result.document.header.id).toBe("doc-1");
    });

    it("should return immediately if read model is already up to date", async () => {
      const doc = createDocModelDocument({ id: "doc-3" });
      const jobInfo = await reactor.create(doc);

      const completedJob = await waitForJobCompletion(jobInfo.id);
      const consistencyToken = completedJob.consistencyToken;

      await new Promise((resolve) => setTimeout(resolve, 100));

      const result = await reactor.get("doc-3", undefined, consistencyToken);

      expect(result.document.header.id).toBe("doc-3");
    });
  });

  describe("Multiple operations with consistency", () => {
    it("should handle consistency tokens from multiple operations", async () => {
      testCoordinator.pause();

      const doc1 = createDocModelDocument({ id: "doc-multi-1" });
      const doc2 = createDocModelDocument({ id: "doc-multi-2" });
      const doc3 = createDocModelDocument({ id: "doc-multi-3" });

      const job1 = await reactor.create(doc1);
      const job2 = await reactor.create(doc2);
      const job3 = await reactor.create(doc3);

      const [completed1, completed2, completed3] = await Promise.all([
        waitForJobCompletion(job1.id),
        waitForJobCompletion(job2.id),
        waitForJobCompletion(job3.id),
      ]);

      const mergedToken: ConsistencyToken = {
        version: 1,
        createdAtUtcIso: new Date().toISOString(),
        coordinates: [
          ...completed1.consistencyToken.coordinates,
          ...completed2.consistencyToken.coordinates,
          ...completed3.consistencyToken.coordinates,
        ],
      };

      expect(testCoordinator.getQueueLength()).toBeGreaterThan(0);

      const queryPromise = reactor.find(
        { ids: ["doc-multi-1", "doc-multi-2", "doc-multi-3"] },
        undefined,
        undefined,
        mergedToken,
      );

      await new Promise((resolve) => setTimeout(resolve, 50));

      const isQueryStillPending = await Promise.race([
        queryPromise.then(() => false),
        Promise.resolve(true),
      ]);
      expect(isQueryStillPending).toBe(true);

      await testCoordinator.flush();

      const result = await queryPromise;
      expect(result.results).toHaveLength(3);
      expect(result.results.map((d) => d.header.id).sort()).toEqual([
        "doc-multi-1",
        "doc-multi-2",
        "doc-multi-3",
      ]);
    });
  });

  describe("Timeout and abort scenarios", () => {
    it("should timeout when consistency is not reached within timeout period", async () => {
      testCoordinator.pause();

      const doc = createDocModelDocument({ id: "doc-timeout" });
      const jobInfo = await reactor.create(doc);

      const completedJob = await waitForJobCompletion(jobInfo.id);
      const consistencyToken = completedJob.consistencyToken;

      const controller = new AbortController();
      setTimeout(() => controller.abort(), 100);

      await expect(
        reactor.get(
          "doc-timeout",
          undefined,
          consistencyToken,
          controller.signal,
        ),
      ).rejects.toThrow();

      await testCoordinator.flush();
    });

    it("should handle abort signal cancellation", async () => {
      testCoordinator.pause();

      const doc = createDocModelDocument({ id: "doc-abort" });
      const jobInfo = await reactor.create(doc);

      const completedJob = await waitForJobCompletion(jobInfo.id);
      const consistencyToken = completedJob.consistencyToken;

      const controller = new AbortController();

      const queryPromise = reactor.get(
        "doc-abort",
        undefined,
        consistencyToken,
        controller.signal,
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      controller.abort();

      await expect(queryPromise).rejects.toThrow();

      await testCoordinator.flush();
    });
  });

  describe("Race condition prevention", () => {
    it("should guarantee query returns only after read model has indexed the operation", async () => {
      testCoordinator.pause();

      const doc = createDocModelDocument({ id: "doc-race" });
      const jobInfo = await reactor.create(doc);

      const completedJob = await waitForJobCompletion(jobInfo.id);
      const consistencyToken = completedJob.consistencyToken;

      let queryCompleted = false;
      let flushCompleted = false;

      const queryPromise = reactor
        .get("doc-race", undefined, consistencyToken)
        .then((result) => {
          queryCompleted = true;
          expect(flushCompleted).toBe(true);
          return result;
        });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(queryCompleted).toBe(false);

      await testCoordinator.flush();
      flushCompleted = true;

      const result = await queryPromise;
      expect(result.document.header.id).toBe("doc-race");
      expect(queryCompleted).toBe(true);
    });

    it("should work correctly with find and consistency tokens", async () => {
      testCoordinator.pause();

      const doc = createDocModelDocument({ id: "doc-find-test" });
      const jobInfo = await reactor.create(doc);

      const completedJob = await waitForJobCompletion(jobInfo.id);
      const consistencyToken = completedJob.consistencyToken;

      const queryPromise = reactor.find(
        { type: doc.header.documentType },
        undefined,
        undefined,
        consistencyToken,
      );

      await new Promise((resolve) => setTimeout(resolve, 50));

      await testCoordinator.flush();

      const result = await queryPromise;
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results.some((d) => d.header.id === "doc-find-test")).toBe(
        true,
      );
    });
  });
});
