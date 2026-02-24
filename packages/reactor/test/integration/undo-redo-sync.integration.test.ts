import { driveDocumentModelModule, MemoryStorage } from "document-drive";
import type { DocumentModelDocument } from "document-model";
import { documentModelDocumentModelModule, setModelName } from "document-model";
import type { Operation } from "document-model";
import { garbageCollectV2, sortOperations, undoV2 } from "document-model/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReactorBuilder, type IReactor } from "../../src/index.js";
import { JobStatus, type ConsistencyToken } from "../../src/shared/types.js";
import { createDocModelDocument } from "../factories.js";

describe("Undo/Redo Sync Integration", () => {
  let reactorA: IReactor;
  let reactorB: IReactor;

  beforeEach(async () => {
    vi.useFakeTimers();

    const builderA = new ReactorBuilder()
      .withDocumentModels([
        documentModelDocumentModelModule as any,
        driveDocumentModelModule as any,
      ])
      .withLegacyStorage(new MemoryStorage());

    reactorA = await builderA.build();

    const builderB = new ReactorBuilder()
      .withDocumentModels([
        documentModelDocumentModelModule as any,
        driveDocumentModelModule as any,
      ])
      .withLegacyStorage(new MemoryStorage());

    reactorB = await builderB.build();
  });

  afterEach(() => {
    reactorA.kill();
    reactorB.kill();

    vi.useRealTimers();
  });

  async function createAndShareDocument(
    sourceReactor: IReactor,
    targetReactor: IReactor,
  ): Promise<{
    docId: string;
    tokenA: ConsistencyToken;
    tokenB: ConsistencyToken;
  }> {
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const document = createDocModelDocument({
      id: `undo-sync-doc-${Date.now()}`,
      slug: `undo-sync-doc-${Date.now()}`,
    });

    const info = await sourceReactor.create(document);
    const tokenA = await waitForJobCompletion(sourceReactor, info.id);

    const createOps = await sourceReactor.getOperations(
      document.header.id,
      { branch: "main", scopes: ["document"] },
      undefined,
      undefined,
      tokenA,
    );

    const loadInfo = await targetReactor.load(
      document.header.id,
      "main",
      createOps.document.results,
    );
    const tokenB = await waitForJobCompletion(targetReactor, loadInfo.id);

    return { docId: document.header.id, tokenA, tokenB };
  }

  async function getEffectiveActionIds(
    reactor: IReactor,
    docId: string,
  ): Promise<Set<string>> {
    const ops = await reactor.getOperations(
      docId,
      { branch: "main", scopes: ["global"] },
      undefined,
      undefined,
      undefined,
    );
    const sorted = sortOperations([...ops.global.results]) as Operation[];
    const gc = garbageCollectV2(sorted) as Operation[];
    const ids = new Set<string>();
    for (const op of gc) {
      if (op.action.type !== "NOOP") {
        ids.add(op.action.id);
      }
    }
    return ids;
  }

  async function expectConvergence(
    docId: string,
    expectedName: string,
  ): Promise<void> {
    const resultA = await reactorA.get<DocumentModelDocument>(docId, {
      branch: "main",
    });
    const resultB = await reactorB.get<DocumentModelDocument>(docId, {
      branch: "main",
    });
    expect(resultA.state.global.name).toBe(expectedName);
    expect(resultB.state.global.name).toBe(expectedName);

    const effectiveA = await getEffectiveActionIds(reactorA, docId);
    const effectiveB = await getEffectiveActionIds(reactorB, docId);
    expect(effectiveA).toEqual(effectiveB);
  }

  it("simple undo syncs without conflicts", async () => {
    const { docId } = await createAndShareDocument(reactorA, reactorB);

    vi.advanceTimersByTime(1000);
    const setJob = await reactorA.execute(docId, "main", [
      setModelName({ name: "X" }),
    ]);
    const setToken = await waitForJobCompletion(reactorA, setJob.id);

    const opsAfterSet = await reactorA.getOperations(
      docId,
      { branch: "main", scopes: ["global"] },
      undefined,
      undefined,
      setToken,
    );
    const setAction = opsAfterSet.global.results[0].action;

    let loadInfo = await reactorB.load(
      docId,
      "main",
      opsAfterSet.global.results,
    );
    await waitForJobCompletion(reactorB, loadInfo.id);

    const bBeforeUndo = await reactorB.get<DocumentModelDocument>(docId, {
      branch: "main",
    });
    expect(bBeforeUndo.state.global.name).toBe("X");

    vi.advanceTimersByTime(1000);
    const undoJob = await reactorA.execute(docId, "main", [
      undoV2(setAction.id),
    ]);
    const undoToken = await waitForJobCompletion(reactorA, undoJob.id);

    const opsAfterUndo = await reactorA.getOperations(
      docId,
      { branch: "main", scopes: ["global"] },
      undefined,
      undefined,
      undoToken,
    );

    loadInfo = await reactorB.load(docId, "main", opsAfterUndo.global.results);
    await waitForJobCompletion(reactorB, loadInfo.id);

    await expectConvergence(docId, "");
  });

  it("undo + reshuffle (undo arrives with conflicting local ops)", async () => {
    const { docId } = await createAndShareDocument(reactorA, reactorB);

    vi.advanceTimersByTime(1000);
    const a1Job = await reactorA.execute(docId, "main", [
      setModelName({ name: "A1" }),
    ]);
    const a1Token = await waitForJobCompletion(reactorA, a1Job.id);

    const opsAfterA1 = await reactorA.getOperations(
      docId,
      { branch: "main", scopes: ["global"] },
      undefined,
      undefined,
      a1Token,
    );
    const a1Action = opsAfterA1.global.results[0].action;

    vi.advanceTimersByTime(1000);
    const b1Job = await reactorB.execute(docId, "main", [
      setModelName({ name: "B1" }),
    ]);
    await waitForJobCompletion(reactorB, b1Job.id);

    vi.advanceTimersByTime(1000);
    const undoJob = await reactorA.execute(docId, "main", [
      undoV2(a1Action.id),
    ]);
    const undoToken = await waitForJobCompletion(reactorA, undoJob.id);

    const aAllOps = await reactorA.getOperations(
      docId,
      { branch: "main", scopes: ["global"] },
      undefined,
      undefined,
      undoToken,
    );

    let loadInfo = await reactorB.load(docId, "main", aAllOps.global.results);
    const bToken = await waitForJobCompletion(reactorB, loadInfo.id);

    const resultB = await reactorB.get<DocumentModelDocument>(docId, {
      branch: "main",
    });
    expect(resultB.state.global.name).toBe("B1");

    const bAllOps = await reactorB.getOperations(
      docId,
      { branch: "main", scopes: ["global"] },
      undefined,
      undefined,
      bToken,
    );

    loadInfo = await reactorA.load(docId, "main", bAllOps.global.results);
    await waitForJobCompletion(reactorA, loadInfo.id);

    await expectConvergence(docId, "B1");
  });

  it("both sides undo independently then sync", async () => {
    const { docId } = await createAndShareDocument(reactorA, reactorB);

    vi.advanceTimersByTime(1000);
    const a1Job = await reactorA.execute(docId, "main", [
      setModelName({ name: "A1" }),
    ]);
    const a1Token = await waitForJobCompletion(reactorA, a1Job.id);

    const opsA1 = await reactorA.getOperations(
      docId,
      { branch: "main", scopes: ["global"] },
      undefined,
      undefined,
      a1Token,
    );
    const a1ActionId = opsA1.global.results[0].action.id;

    vi.advanceTimersByTime(1000);
    const b1Job = await reactorB.execute(docId, "main", [
      setModelName({ name: "B1" }),
    ]);
    const b1Token = await waitForJobCompletion(reactorB, b1Job.id);

    const opsB1 = await reactorB.getOperations(
      docId,
      { branch: "main", scopes: ["global"] },
      undefined,
      undefined,
      b1Token,
    );
    const b1ActionId = opsB1.global.results[0].action.id;

    vi.advanceTimersByTime(1000);
    const undoAJob = await reactorA.execute(docId, "main", [
      undoV2(a1ActionId),
    ]);
    const undoAToken = await waitForJobCompletion(reactorA, undoAJob.id);

    vi.advanceTimersByTime(1000);
    const undoBJob = await reactorB.execute(docId, "main", [
      undoV2(b1ActionId),
    ]);
    const undoBToken = await waitForJobCompletion(reactorB, undoBJob.id);

    const aFinalOps = await reactorA.getOperations(
      docId,
      { branch: "main", scopes: ["global"] },
      undefined,
      undefined,
      undoAToken,
    );

    const bFinalOps = await reactorB.getOperations(
      docId,
      { branch: "main", scopes: ["global"] },
      undefined,
      undefined,
      undoBToken,
    );

    let loadInfo = await reactorB.load(docId, "main", aFinalOps.global.results);
    await waitForJobCompletion(reactorB, loadInfo.id);

    loadInfo = await reactorA.load(docId, "main", bFinalOps.global.results);
    await waitForJobCompletion(reactorA, loadInfo.id);

    await expectConvergence(docId, "");
  });

  it("cross-reactor undo (B undoes A's operation)", async () => {
    const { docId } = await createAndShareDocument(reactorA, reactorB);

    vi.advanceTimersByTime(1000);
    const a1Job = await reactorA.execute(docId, "main", [
      setModelName({ name: "A1" }),
    ]);
    const a1Token = await waitForJobCompletion(reactorA, a1Job.id);

    const opsA1 = await reactorA.getOperations(
      docId,
      { branch: "main", scopes: ["global"] },
      undefined,
      undefined,
      a1Token,
    );
    const a1ActionId = opsA1.global.results[0].action.id;

    let loadInfo = await reactorB.load(docId, "main", opsA1.global.results);
    await waitForJobCompletion(reactorB, loadInfo.id);

    vi.advanceTimersByTime(1000);
    const undoBJob = await reactorB.execute(docId, "main", [
      undoV2(a1ActionId),
    ]);
    const undoBToken = await waitForJobCompletion(reactorB, undoBJob.id);

    const bOps = await reactorB.getOperations(
      docId,
      { branch: "main", scopes: ["global"] },
      undefined,
      undefined,
      undoBToken,
    );

    loadInfo = await reactorA.load(docId, "main", bOps.global.results);
    await waitForJobCompletion(reactorA, loadInfo.id);

    await expectConvergence(docId, "");
  });

  it("undo then re-apply syncs correctly", async () => {
    const { docId } = await createAndShareDocument(reactorA, reactorB);

    vi.advanceTimersByTime(1000);
    const setJob1 = await reactorA.execute(docId, "main", [
      setModelName({ name: "X" }),
    ]);
    const set1Token = await waitForJobCompletion(reactorA, setJob1.id);

    const ops1 = await reactorA.getOperations(
      docId,
      { branch: "main", scopes: ["global"] },
      undefined,
      undefined,
      set1Token,
    );
    const set1ActionId = ops1.global.results[0].action.id;

    vi.advanceTimersByTime(1000);
    const undoJob = await reactorA.execute(docId, "main", [
      undoV2(set1ActionId),
    ]);
    await waitForJobCompletion(reactorA, undoJob.id);

    vi.advanceTimersByTime(1000);
    const setJob2 = await reactorA.execute(docId, "main", [
      setModelName({ name: "X" }),
    ]);
    const finalToken = await waitForJobCompletion(reactorA, setJob2.id);

    const allOps = await reactorA.getOperations(
      docId,
      { branch: "main", scopes: ["global"] },
      undefined,
      undefined,
      finalToken,
    );

    const loadInfo = await reactorB.load(docId, "main", allOps.global.results);
    await waitForJobCompletion(reactorB, loadInfo.id);

    await expectConvergence(docId, "X");
  });

  it("interleaved mutations and selective undos from both sides", async () => {
    const { docId } = await createAndShareDocument(reactorA, reactorB);

    vi.advanceTimersByTime(1000);
    const a1Job = await reactorA.execute(docId, "main", [
      setModelName({ name: "A1" }),
    ]);
    await waitForJobCompletion(reactorA, a1Job.id);

    vi.advanceTimersByTime(1000);
    const a2Job = await reactorA.execute(docId, "main", [
      setModelName({ name: "A2" }),
    ]);
    const a2Token = await waitForJobCompletion(reactorA, a2Job.id);

    const opsA = await reactorA.getOperations(
      docId,
      { branch: "main", scopes: ["global"] },
      undefined,
      undefined,
      a2Token,
    );
    const a2ActionId = opsA.global.results[1].action.id;

    vi.advanceTimersByTime(1000);
    const b1Job = await reactorB.execute(docId, "main", [
      setModelName({ name: "B1" }),
    ]);
    await waitForJobCompletion(reactorB, b1Job.id);

    vi.advanceTimersByTime(1000);
    const b2Job = await reactorB.execute(docId, "main", [
      setModelName({ name: "B2" }),
    ]);
    const b2Token = await waitForJobCompletion(reactorB, b2Job.id);

    const opsB = await reactorB.getOperations(
      docId,
      { branch: "main", scopes: ["global"] },
      undefined,
      undefined,
      b2Token,
    );
    const b1ActionId = opsB.global.results[0].action.id;

    vi.advanceTimersByTime(1000);
    const undoA2Job = await reactorA.execute(docId, "main", [
      undoV2(a2ActionId),
    ]);
    const undoA2Token = await waitForJobCompletion(reactorA, undoA2Job.id);

    vi.advanceTimersByTime(1000);
    const undoB1Job = await reactorB.execute(docId, "main", [
      undoV2(b1ActionId),
    ]);
    const undoB1Token = await waitForJobCompletion(reactorB, undoB1Job.id);

    const aFinalOps = await reactorA.getOperations(
      docId,
      { branch: "main", scopes: ["global"] },
      undefined,
      undefined,
      undoA2Token,
    );
    const bFinalOps = await reactorB.getOperations(
      docId,
      { branch: "main", scopes: ["global"] },
      undefined,
      undefined,
      undoB1Token,
    );

    let loadInfo = await reactorB.load(docId, "main", aFinalOps.global.results);
    await waitForJobCompletion(reactorB, loadInfo.id);

    loadInfo = await reactorA.load(docId, "main", bFinalOps.global.results);
    await waitForJobCompletion(reactorA, loadInfo.id);

    await expectConvergence(docId, "B2");
  });

  it("stored undo operations are NOOPs with correct metadata", async () => {
    const { docId } = await createAndShareDocument(reactorA, reactorB);

    vi.advanceTimersByTime(1000);
    const setJob = await reactorA.execute(docId, "main", [
      setModelName({ name: "X" }),
    ]);
    const setToken = await waitForJobCompletion(reactorA, setJob.id);

    const opsAfterSet = await reactorA.getOperations(
      docId,
      { branch: "main", scopes: ["global"] },
      undefined,
      undefined,
      setToken,
    );
    const setActionId = opsAfterSet.global.results[0].action.id;

    vi.advanceTimersByTime(1000);
    const undoJob = await reactorA.execute(docId, "main", [
      undoV2(setActionId),
    ]);
    const undoToken = await waitForJobCompletion(reactorA, undoJob.id);

    const opsAfterUndo = await reactorA.getOperations(
      docId,
      { branch: "main", scopes: ["global"] },
      undefined,
      undefined,
      undoToken,
    );

    expect(opsAfterUndo.global.results).toHaveLength(2);

    const noopOp = opsAfterUndo.global.results[1];
    expect(noopOp.action.type).toBe("NOOP");
    expect((noopOp.action.input as { undoOf: string }).undoOf).toBe(
      setActionId,
    );
    expect(noopOp.skip).toBe(0);

    const loadInfo = await reactorB.load(
      docId,
      "main",
      opsAfterUndo.global.results,
    );
    await waitForJobCompletion(reactorB, loadInfo.id);

    const bOps = await reactorB.getOperations(
      docId,
      { branch: "main", scopes: ["global"] },
      undefined,
      undefined,
      undefined,
    );

    const bNoopOps = bOps.global.results.filter(
      (op) => op.action.type === "NOOP",
    );
    expect(bNoopOps.length).toBeGreaterThanOrEqual(1);

    const bNoop = bNoopOps[0];
    expect(bNoop.action.type).toBe("NOOP");
    expect((bNoop.action.input as { undoOf: string }).undoOf).toBe(setActionId);
    expect(bNoop.skip).toBe(0);

    const resultB = await reactorB.get<DocumentModelDocument>(docId, {
      branch: "main",
    });
    expect(resultB.state.global.name).toBe("");
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
