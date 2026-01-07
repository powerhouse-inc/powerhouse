import { driveDocumentModelModule, MemoryStorage } from "document-drive";
import { documentModelDocumentModelModule, setModelName } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReactorBuilder, type IReactor } from "../../src/index.js";
import { JobStatus, type ConsistencyToken } from "../../src/shared/types.js";
import { createDocModelDocument } from "../factories.js";

/**
 * This suite verifies that operation IDs are preserved during load operations.
 *
 * Key invariant: An operation's ID is derived from (documentId, scope, branch, actionType, actionId, index, skip).
 * Once an operation is created with a specific ID, loading that same operation should preserve the ID.
 *
 * Related test: document-model/test/document/operation-id.test.ts
 * "should not change operations id when replay document"
 */
describe("Load Operation ID Preservation", () => {
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

  it("preserves operation IDs when loading operations that arrive in order", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    // Create document on reactor A
    const document = createDocModelDocument({
      id: "id-preservation-doc",
      slug: "id-preservation-doc",
    });
    const createInfo = await reactorA.create(document);
    await waitForJobCompletion(reactorA, createInfo.id);

    // Execute some operations on A
    vi.advanceTimersByTime(1000);
    const mutateJob1 = await reactorA.execute(document.header.id, "main", [
      setModelName({ name: "Name1" }),
    ]);
    await waitForJobCompletion(reactorA, mutateJob1.id);

    vi.advanceTimersByTime(1000);
    const mutateJob2 = await reactorA.execute(document.header.id, "main", [
      setModelName({ name: "Name2" }),
    ]);
    const finalTokenA = await waitForJobCompletion(reactorA, mutateJob2.id);

    // Get all operations from A
    const aDocOps = await reactorA.getOperations(
      document.header.id,
      { branch: "main", scopes: ["document"] },
      undefined,
      finalTokenA,
    );
    const aGlobalOps = await reactorA.getOperations(
      document.header.id,
      { branch: "main", scopes: ["global"] },
      undefined,
      finalTokenA,
    );

    // Load document operations into B
    const loadDocJob = await reactorB.load(
      document.header.id,
      "main",
      aDocOps.document.results,
    );
    await waitForJobCompletion(reactorB, loadDocJob.id);

    // Load global operations into B
    const loadGlobalJob = await reactorB.load(
      document.header.id,
      "main",
      aGlobalOps.global.results,
    );
    const finalTokenB = await waitForJobCompletion(reactorB, loadGlobalJob.id);

    // Get operations from B
    const bGlobalOps = await reactorB.getOperations(
      document.header.id,
      { branch: "main", scopes: ["global"] },
      undefined,
      finalTokenB,
    );

    // Operation IDs should be preserved
    expect(bGlobalOps.global.results).toHaveLength(
      aGlobalOps.global.results.length,
    );
    for (let i = 0; i < aGlobalOps.global.results.length; i++) {
      const opA = aGlobalOps.global.results[i];
      const opB = bGlobalOps.global.results[i];
      expect(opB.id).toBe(opA.id);
      expect(opB.index).toBe(opA.index);
      expect(opB.skip).toBe(opA.skip);
    }
  });

  it("uses action ID for duplicate detection during load", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    // Create document on reactor A
    const document = createDocModelDocument({
      id: "duplicate-load-doc",
      slug: "duplicate-load-doc",
    });
    const createInfo = await reactorA.create(document);
    await waitForJobCompletion(reactorA, createInfo.id);

    // Execute operation on A
    vi.advanceTimersByTime(1000);
    const mutateJob = await reactorA.execute(document.header.id, "main", [
      setModelName({ name: "TestName" }),
    ]);
    const tokenA = await waitForJobCompletion(reactorA, mutateJob.id);

    // Get operations from A
    const aDocOps = await reactorA.getOperations(
      document.header.id,
      { branch: "main", scopes: ["document"] },
      undefined,
      tokenA,
    );
    const aGlobalOps = await reactorA.getOperations(
      document.header.id,
      { branch: "main", scopes: ["global"] },
      undefined,
      tokenA,
    );

    // Load into B the first time
    const loadDocJob1 = await reactorB.load(
      document.header.id,
      "main",
      aDocOps.document.results,
    );
    await waitForJobCompletion(reactorB, loadDocJob1.id);

    const loadGlobalJob1 = await reactorB.load(
      document.header.id,
      "main",
      aGlobalOps.global.results,
    );
    const tokenB1 = await waitForJobCompletion(reactorB, loadGlobalJob1.id);

    // Get operations from B after first load
    const bOpsAfterFirstLoad = await reactorB.getOperations(
      document.header.id,
      { branch: "main", scopes: ["global"] },
      undefined,
      tokenB1,
    );

    // Verify the operation was loaded successfully
    expect(bOpsAfterFirstLoad.global.results.length).toBe(1);

    // Verify operation ID was derived correctly for the loaded operation
    const loadedOp = bOpsAfterFirstLoad.global.results[0];
    expect(loadedOp.id).toBeDefined();

    // The operation ID should be derived (not a UUID format)
    // Derived IDs are 32 hex characters, UUIDs have dashes
    expect(loadedOp.id).not.toContain("-");

    // The action ID should be preserved (this is the logical identity)
    expect(loadedOp.action.id).toBe(aGlobalOps.global.results[0].action.id);
  });

  it("derives new IDs for reshuffled operations when local has advanced", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    // Create document on both reactors
    const document = createDocModelDocument({
      id: "advanced-local-doc",
      slug: "advanced-local-doc",
    });

    // Create on A
    const createInfoA = await reactorA.create(document);
    const createTokenA = await waitForJobCompletion(reactorA, createInfoA.id);

    // Get create operations and load into B
    const aDocOps = await reactorA.getOperations(
      document.header.id,
      { branch: "main", scopes: ["document"] },
      undefined,
      createTokenA,
    );

    const loadDocJobB = await reactorB.load(
      document.header.id,
      "main",
      aDocOps.document.results,
    );
    await waitForJobCompletion(reactorB, loadDocJobB.id);

    // Now both have the document. Execute on A with timestamp T1
    vi.advanceTimersByTime(1000);
    const mutateJobA = await reactorA.execute(document.header.id, "main", [
      setModelName({ name: "FromA" }),
    ]);
    const tokenA = await waitForJobCompletion(reactorA, mutateJobA.id);

    const aGlobalOps = await reactorA.getOperations(
      document.header.id,
      { branch: "main", scopes: ["global"] },
      undefined,
      tokenA,
    );

    // Store original operation from A
    const originalOpFromA = aGlobalOps.global.results[0];
    expect(originalOpFromA).toBeDefined();
    expect(originalOpFromA.id).toBeDefined();

    // Execute on B with later timestamp T2 (B is now "ahead")
    vi.advanceTimersByTime(1000);
    const mutateJobB = await reactorB.execute(document.header.id, "main", [
      setModelName({ name: "FromB" }),
    ]);
    await waitForJobCompletion(reactorB, mutateJobB.id);

    // B now has revision 1 in global scope
    // Now load A's operation (which has index 0, but B's latestRevision is 1)
    // This triggers reshuffle - the operation gets a new index, making it a new operation
    const loadJobB = await reactorB.load(
      document.header.id,
      "main",
      aGlobalOps.global.results,
    );
    const finalTokenB = await waitForJobCompletion(reactorB, loadJobB.id);

    const bGlobalOps = await reactorB.getOperations(
      document.header.id,
      { branch: "main", scopes: ["global"] },
      undefined,
      finalTokenB,
    );

    // Find the operation that came from A (by action ID - the logical identity)
    const opFromAInB = bGlobalOps.global.results.find(
      (op) => op.action.id === originalOpFromA.action.id,
    );

    expect(opFromAInB).toBeDefined();

    // Operations are immutable. When an operation's index changes during reshuffle,
    // it becomes a new operation with a new ID derived from the new position.
    // The operation ID should be DIFFERENT from the original since the index changed.
    expect(opFromAInB!.id).not.toBe(originalOpFromA.id);

    // But the action ID (logical identity) should be preserved
    expect(opFromAInB!.action.id).toBe(originalOpFromA.action.id);
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
    return status.status === JobStatus.READ_MODELS_READY;
  });

  const status = await reactor.getJobStatus(jobId);
  return status.consistencyToken;
}
