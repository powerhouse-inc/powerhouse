import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  setModelName,
  type DocumentModelDocument,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { BatchLoadRequest, IReactor } from "../../src/core/types.js";
import { JobStatus, type ConsistencyToken } from "../../src/shared/types.js";
import { createDocModelDocument } from "../factories.js";

/**
 * Regression test for the orphan reshuffle bug. Two `loadBatch` calls land on
 * the receiver for the same `(documentId, scope, branch)`. The second batch
 * carries `externalDeps` referencing the first batch's job id. The second
 * batch must wait for the first batch's operations to be persisted before
 * running, otherwise its `getConflicting` lookup would find the source's own
 * operations as "conflicts" and trigger a reshuffle that loops operations
 * back to the sender (`effectiveSourceRemote=""`, `skipCount > 0`).
 */
describe("cross-batch FIFO regression", () => {
  let reactorA: IReactor;
  let reactorB: IReactor;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const builderA = new ReactorBuilder().withDocumentModelSources([
      documentModelDocumentModelModule as any,
      driveDocumentModelModule as any,
    ]);
    reactorA = await builderA.build();

    const builderB = new ReactorBuilder().withDocumentModelSources([
      documentModelDocumentModelModule as any,
      driveDocumentModelModule as any,
    ]);
    reactorB = await builderB.build();
  });

  afterEach(() => {
    reactorA.kill();
    reactorB.kill();
    vi.useRealTimers();
  });

  it("serializes two load batches for the same (doc, scope, branch) via externalDeps and prevents orphan reshuffle", async () => {
    const document = createDocModelDocument({
      id: "fifo-regression-doc",
      slug: "fifo-regression-doc",
    });

    const createInfo = await reactorA.create(document);
    const createTokenA = await waitForJobCompletion(reactorA, createInfo.id);

    const aDocOps = await reactorA.getOperations(
      document.header.id,
      { branch: "main", scopes: ["document"] },
      undefined,
      undefined,
      createTokenA,
    );

    for (let i = 0; i < 11; i++) {
      vi.advanceTimersByTime(1000);
      const job = await reactorA.execute(document.header.id, "main", [
        setModelName({ name: `A${i}` }),
      ]);
      await waitForJobCompletion(reactorA, job.id);
    }

    const aGlobalOpsResult = await reactorA.getOperations(document.header.id, {
      branch: "main",
      scopes: ["global"],
    });
    const aGlobalOps = aGlobalOpsResult.global.results;
    expect(aGlobalOps).toHaveLength(11);

    const docCreateInfo = await reactorB.load(
      document.header.id,
      "main",
      aDocOps.document.results,
    );
    await waitForJobCompletion(reactorB, docCreateInfo.id);

    const firstChunk = aGlobalOps.slice(0, 6);
    const secondChunk = aGlobalOps.slice(6);
    expect(firstChunk).toHaveLength(6);
    expect(secondChunk).toHaveLength(5);

    const batch1: BatchLoadRequest = {
      jobs: [
        {
          key: "batch1-global",
          documentId: document.header.id,
          scope: "global",
          branch: "main",
          operations: firstChunk,
          dependsOn: [],
          externalDeps: [],
        },
      ],
    };
    const batch1Result = await reactorB.loadBatch(batch1);
    const batch1JobId = batch1Result.jobs["batch1-global"].id;

    const batch2: BatchLoadRequest = {
      jobs: [
        {
          key: "batch2-global",
          documentId: document.header.id,
          scope: "global",
          branch: "main",
          operations: secondChunk,
          dependsOn: [],
          externalDeps: [batch1JobId],
        },
      ],
    };
    const batch2Result = await reactorB.loadBatch(batch2);
    const batch2JobId = batch2Result.jobs["batch2-global"].id;

    const tokenB1 = await waitForJobCompletion(reactorB, batch1JobId);
    const tokenB2 = await waitForJobCompletion(reactorB, batch2JobId);

    const bGlobalOps = await reactorB.getOperations(
      document.header.id,
      { branch: "main", scopes: ["global"] },
      undefined,
      undefined,
      tokenB2,
    );

    expect(bGlobalOps.global.results).toHaveLength(11);

    for (const op of bGlobalOps.global.results) {
      expect(op.skip).toBe(0);
    }

    for (let i = 0; i < 11; i++) {
      expect(bGlobalOps.global.results[i].index).toBe(i);
    }

    const sourceIds = aGlobalOps.map((op) => op.id);
    const sinkIds = bGlobalOps.global.results.map((op) => op.id);
    expect(sinkIds).toEqual(sourceIds);

    const resultB = await reactorB.get<DocumentModelDocument>(
      document.header.id,
      { branch: "main" },
    );
    expect(resultB.state.global.name).toBe("A10");

    expect(tokenB1.coordinates.length).toBeGreaterThan(0);
  });

  it("head-of-line blocks the second batch on the same sub-queue even without externalDeps", async () => {
    const document = createDocModelDocument({
      id: "fifo-hol-doc",
      slug: "fifo-hol-doc",
    });

    const createInfo = await reactorA.create(document);
    const createTokenA = await waitForJobCompletion(reactorA, createInfo.id);

    const aDocOps = await reactorA.getOperations(
      document.header.id,
      { branch: "main", scopes: ["document"] },
      undefined,
      undefined,
      createTokenA,
    );

    for (let i = 0; i < 8; i++) {
      vi.advanceTimersByTime(1000);
      const job = await reactorA.execute(document.header.id, "main", [
        setModelName({ name: `A${i}` }),
      ]);
      await waitForJobCompletion(reactorA, job.id);
    }

    const aGlobalOpsResult = await reactorA.getOperations(document.header.id, {
      branch: "main",
      scopes: ["global"],
    });
    const aGlobalOps = aGlobalOpsResult.global.results;
    expect(aGlobalOps).toHaveLength(8);

    const docCreateInfo = await reactorB.load(
      document.header.id,
      "main",
      aDocOps.document.results,
    );
    await waitForJobCompletion(reactorB, docCreateInfo.id);

    const firstChunk = aGlobalOps.slice(0, 4);
    const secondChunk = aGlobalOps.slice(4);

    const batch1Result = await reactorB.loadBatch({
      jobs: [
        {
          key: "b1",
          documentId: document.header.id,
          scope: "global",
          branch: "main",
          operations: firstChunk,
          dependsOn: [],
          externalDeps: [],
        },
      ],
    });

    const batch2Result = await reactorB.loadBatch({
      jobs: [
        {
          key: "b2",
          documentId: document.header.id,
          scope: "global",
          branch: "main",
          operations: secondChunk,
          dependsOn: [],
          externalDeps: [],
        },
      ],
    });

    await waitForJobCompletion(reactorB, batch1Result.jobs.b1.id);
    const tokenB2 = await waitForJobCompletion(
      reactorB,
      batch2Result.jobs.b2.id,
    );

    const bGlobalOps = await reactorB.getOperations(
      document.header.id,
      { branch: "main", scopes: ["global"] },
      undefined,
      undefined,
      tokenB2,
    );

    expect(bGlobalOps.global.results).toHaveLength(8);

    for (const op of bGlobalOps.global.results) {
      expect(op.skip).toBe(0);
    }

    for (let i = 0; i < 8; i++) {
      expect(bGlobalOps.global.results[i].index).toBe(i);
    }

    const sourceIds = aGlobalOps.map((op) => op.id);
    const sinkIds = bGlobalOps.global.results.map((op) => op.id);
    expect(sinkIds).toEqual(sourceIds);
  });
});

async function waitForJobCompletion(
  reactor: IReactor,
  jobId: string,
): Promise<ConsistencyToken> {
  await vi.waitUntil(async () => {
    const status = await reactor.getJobStatus(jobId);
    if (status.status === JobStatus.FAILED) {
      throw new Error(status.error?.message || "Job failed");
    }
    return status.status === JobStatus.READ_READY;
  });

  const status = await reactor.getJobStatus(jobId);
  return status.consistencyToken;
}
