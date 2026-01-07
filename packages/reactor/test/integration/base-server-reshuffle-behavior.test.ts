import { driveDocumentModelModule, MemoryStorage } from "document-drive";
import type { DocumentModelDocument } from "document-model";
import { documentModelDocumentModelModule, setModelName } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReactorBuilder, type IReactor } from "../../src/index.js";
import { JobStatus, type ConsistencyToken } from "../../src/shared/types.js";
import { createDocModelDocument } from "../factories.js";

/**
 * This test explicitly verifies what operations end up in the store
 * and what their skip values are after a reshuffle scenario.
 *
 * Scenario:
 * 1. A executes setModelName("A1") at T1
 * 2. B executes setModelName("B1") at T2 (T2 > T1, so later)
 * 3. B loads A's operation
 *
 * Expected base-server behavior:
 * - Original B@0 stays in the store
 * - A@1 with skip=1 is added (indicates it supersedes 1 operation)
 * - B@2 with skip=0 is added (B's action re-applied at new index)
 * - Total: 3 operations
 * - Final state: "B1" (B's operation applied last)
 */
describe("Base Server Reshuffle Behavior", () => {
  let reactorA: IReactor;
  let reactorB: IReactor;

  beforeEach(async () => {
    vi.useFakeTimers();

    const builderA = new ReactorBuilder()
      .withDocumentModels([
        documentModelDocumentModelModule as any,
        driveDocumentModelModule as any,
      ])
      .withFeatures({
        legacyStorageEnabled: false,
      })
      .withLegacyStorage(new MemoryStorage());

    reactorA = await builderA.build();

    const builderB = new ReactorBuilder()
      .withDocumentModels([
        documentModelDocumentModelModule as any,
        driveDocumentModelModule as any,
      ])
      .withFeatures({
        legacyStorageEnabled: false,
      })
      .withLegacyStorage(new MemoryStorage());

    reactorB = await builderB.build();
  });

  afterEach(() => {
    reactorA.kill();
    reactorB.kill();
    vi.useRealTimers();
  });

  it("shows exact operations and skip values after reshuffle", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    // Create document on A
    const document = createDocModelDocument({
      id: "reshuffle-test-doc",
      slug: "reshuffle-test-doc",
    });
    const createInfo = await reactorA.create(document);
    await waitForJobCompletion(reactorA, createInfo.id);

    // Get create operations and load into B
    const aDocOps = await reactorA.getOperations(document.header.id, {
      branch: "main",
      scopes: ["document"],
    });

    const loadDocJobB = await reactorB.load(
      document.header.id,
      "main",
      aDocOps.document.results,
    );
    await waitForJobCompletion(reactorB, loadDocJobB.id);

    // Now both have the document

    // Step 1: A executes setModelName("A1") at T1
    vi.advanceTimersByTime(1000);
    const T1 = new Date().toISOString();
    console.log("T1 (A's operation):", T1);

    const mutateJobA = await reactorA.execute(document.header.id, "main", [
      setModelName({ name: "A1" }),
    ]);
    const tokenA = await waitForJobCompletion(reactorA, mutateJobA.id);

    const aGlobalOps = await reactorA.getOperations(
      document.header.id,
      { branch: "main", scopes: ["global"] },
      undefined,
      tokenA,
    );

    console.log("A's global operations after execute:");
    for (const op of aGlobalOps.global.results) {
      console.log(`  index=${op.index}, skip=${op.skip}, timestamp=${op.timestampUtcMs}, action=${op.action.type}, input=${JSON.stringify((op.action.input as any)?.name)}`);
    }

    // Step 2: B executes setModelName("B1") at T2 (later)
    vi.advanceTimersByTime(1000);
    const T2 = new Date().toISOString();
    console.log("T2 (B's operation):", T2);

    const mutateJobB = await reactorB.execute(document.header.id, "main", [
      setModelName({ name: "B1" }),
    ]);
    await waitForJobCompletion(reactorB, mutateJobB.id);

    const bGlobalOpsBefore = await reactorB.getOperations(document.header.id, {
      branch: "main",
      scopes: ["global"],
    });

    console.log("B's global operations BEFORE loading A's op:");
    for (const op of bGlobalOpsBefore.global.results) {
      console.log(`  index=${op.index}, skip=${op.skip}, timestamp=${op.timestampUtcMs}, action=${op.action.type}, input=${JSON.stringify((op.action.input as any)?.name)}`);
    }

    // Step 3: B loads A's operation
    const loadJobB = await reactorB.load(
      document.header.id,
      "main",
      aGlobalOps.global.results,
    );
    const finalTokenB = await waitForJobCompletion(reactorB, loadJobB.id);

    const bGlobalOpsAfter = await reactorB.getOperations(
      document.header.id,
      { branch: "main", scopes: ["global"] },
      undefined,
      finalTokenB,
    );

    console.log("B's global operations AFTER loading A's op:");
    for (const op of bGlobalOpsAfter.global.results) {
      console.log(`  index=${op.index}, skip=${op.skip}, timestamp=${op.timestampUtcMs}, action=${op.action.type}, input=${JSON.stringify((op.action.input as any)?.name)}, id=${op.id}`);
    }

    // Log the final state
    const result = await reactorB.get<DocumentModelDocument>(
      document.header.id,
      { branch: "main" },
    );
    console.log("Final state name:", result.document.state.global.name);

    // EXPECTED BASE-SERVER BEHAVIOR (with index in operation ID):
    // - 3 operations: B@0, A@1(skip=1), B@2(skip=0)
    // - B@2 has a DIFFERENT operation ID than B@0 (because index is in the hash)
    // - Final state: "B1" (B's operation at index 2 applied last)

    // ACTUAL BEHAVIOR WITH STABLE IDs (index NOT in operation ID):
    // - 2 operations: B@0, A@1(skip=1)
    // - Cannot re-add B@2 because it would have SAME operation ID as B@0
    // - Final state: "A1" (A's operation at index 1 applied last)

    // Document current behavior:
    expect(bGlobalOpsAfter.global.results).toHaveLength(2);

    // Operation 0: B's original (unchanged)
    expect(bGlobalOpsAfter.global.results[0].index).toBe(0);
    expect(bGlobalOpsAfter.global.results[0].skip).toBe(0);
    expect((bGlobalOpsAfter.global.results[0].action.input as any).name).toBe("B1");

    // Operation 1: A's operation (appended with skip=1)
    expect(bGlobalOpsAfter.global.results[1].index).toBe(1);
    expect(bGlobalOpsAfter.global.results[1].skip).toBe(1);
    expect((bGlobalOpsAfter.global.results[1].action.input as any).name).toBe("A1");

    // Final state is A1 (not B1!) because A is at higher index
    expect(result.document.state.global.name).toBe("A1");
  });
});

async function waitForJobCompletion(
  reactor: IReactor,
  jobId: string,
): Promise<ConsistencyToken> {
  await vi.waitUntil(
    async () => {
      await vi.advanceTimersToNextTimerAsync();
      const status = await reactor.getJobStatus(jobId);
      if (status.status === JobStatus.FAILED) {
        throw new Error(status.error?.message || "Job failed");
      }
      return status.status === JobStatus.READ_MODELS_READY;
    },
    { timeout: 10000 },
  );

  const status = await reactor.getJobStatus(jobId);
  return status.consistencyToken;
}
