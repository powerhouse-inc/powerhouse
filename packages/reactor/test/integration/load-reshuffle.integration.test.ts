import { driveDocumentModelModule, MemoryStorage } from "document-drive";
import type { DocumentModelDocument } from "document-model";
import { documentModelDocumentModelModule, setModelName } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReactorBuilder, type IReactor } from "../../src/index.js";
import { JobStatus, type ConsistencyToken } from "../../src/shared/types.js";
import { createDocModelDocument } from "../factories.js";

/**
 * This suite verifies that when loading operations into a reactor, the operations
 * are reshuffled correctly to maintain consistency.
 */
describe("Load Reshuffles", () => {
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

  it("appends reshuffled operations with skip to the log", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const document = createDocModelDocument({
      id: "reshuffle-doc",
      slug: "reshuffle-doc",
    });
    let info = await reactorA.create(document);
    const createTokenA = await waitForJobCompletion(reactorA, info.id);

    const aCreateOperations = await reactorA.getOperations(
      document.header.id,
      {
        branch: "main",
        scopes: ["document"],
      },
      undefined,
      undefined,
      createTokenA,
    );

    info = await reactorB.load(
      document.header.id,
      "main",
      aCreateOperations.document.results,
    );
    const loadTokenB = await waitForJobCompletion(reactorB, info.id);

    const bOperations = await reactorB.getOperations(
      document.header.id,
      {
        branch: "main",
        scopes: ["document"],
      },
      undefined,
      undefined,
      loadTokenB,
    );

    expect(aCreateOperations.document.results).toHaveLength(2);
    expect(bOperations.document.results).toHaveLength(2);

    // They now both have the document

    vi.advanceTimersByTime(1000);

    // First, execute operation on A, but don't pass it to B.
    const mutateJobA = await reactorA.execute(document.header.id, "main", [
      setModelName({ name: "A1" }),
    ]);
    const tokenA = await waitForJobCompletion(reactorA, mutateJobA.id);

    const aOperationsAfterMutate = await reactorA.getOperations(
      document.header.id,
      {
        branch: "main",
        scopes: ["global"],
      },
      undefined,
      undefined,
      tokenA,
    );

    expect(aOperationsAfterMutate.global.results).toHaveLength(1);

    // Next, execute an operation on B, ensure it is later.
    vi.advanceTimersByTime(1000);
    const mutateJobB = await reactorB.execute(document.header.id, "main", [
      setModelName({ name: "B1" }),
    ]);
    await waitForJobCompletion(reactorB, mutateJobB.id);

    // now load the operations from reactor A into reactor B (reactor A operation came first, so this should reshuffle)
    info = await reactorB.load(
      document.header.id,
      "main",
      aOperationsAfterMutate.global.results,
    );

    const finalTokenB = await waitForJobCompletion(reactorB, info.id);

    const bOperationsAfterLoad = await reactorB.getOperations(
      document.header.id,
      {
        branch: "main",
        scopes: ["global"],
      },
      undefined,
      undefined,
      finalTokenB,
    );

    expect(bOperationsAfterLoad.global.results).toHaveLength(3);

    const result = await reactorB.get<DocumentModelDocument>(
      document.header.id,
      {
        branch: "main",
      },
    );
    expect(result.state.global.name).toBe("B1");
  });

  /**
   * Test Scenario:
   *
   * For (index, skip, ts, action):
   *
   * A - [(0, 0, 1, "A0"), (1, 0, 2, "A1")]
   * B - [(0, 0, 0, "B0"), (1, 0, 3, "B1")]
   *
   * B gets A's Operations Scenario:
   * B' - [(0, 0, 0, "B0"), (1, 0, 3, "B1"), (2, 1, 1, "A0"), (3, 0, 2, "A1"), (4, 0, 3, "B1")]
   *
   * Then A needs to end up with:
   * A' - [(0, 0, 1, "A0"), (1, 0, 2, "A1"), (2, 2, 0, "B0"), (3, 0, 1, "A0"), (4, 0, 2, "A1"), (5, 0, 3, "B1")]
   *
   * So that both A and B end up with the stream of applied actions (action):
   * [("B0"), ("A0"), ("A1"), ("B1")]
   */
  it("executes a reshuffle scenario", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const document = createDocModelDocument({
      id: "reshuffle-scenario-doc",
      slug: "reshuffle-scenario-doc",
    });

    let info = await reactorA.create(document);
    const createTokenA = await waitForJobCompletion(reactorA, info.id);

    const aCreateOperations = await reactorA.getOperations(
      document.header.id,
      { branch: "main", scopes: ["document"] },
      undefined,
      undefined,
      createTokenA,
    );

    info = await reactorB.load(
      document.header.id,
      "main",
      aCreateOperations.document.results,
    );
    await waitForJobCompletion(reactorB, info.id);

    const b0Job = await reactorB.execute(document.header.id, "main", [
      setModelName({ name: "B0" }),
    ]);
    await waitForJobCompletion(reactorB, b0Job.id);

    vi.advanceTimersByTime(1000);
    const a0Job = await reactorA.execute(document.header.id, "main", [
      setModelName({ name: "A0" }),
    ]);
    await waitForJobCompletion(reactorA, a0Job.id);

    vi.advanceTimersByTime(1000);
    const a1Job = await reactorA.execute(document.header.id, "main", [
      setModelName({ name: "A1" }),
    ]);
    const tokenA = await waitForJobCompletion(reactorA, a1Job.id);

    vi.advanceTimersByTime(1000);
    const b1Job = await reactorB.execute(document.header.id, "main", [
      setModelName({ name: "B1" }),
    ]);
    await waitForJobCompletion(reactorB, b1Job.id);

    const aGlobalOps = await reactorA.getOperations(
      document.header.id,
      { branch: "main", scopes: ["global"] },
      undefined,
      undefined,
      tokenA,
    );

    info = await reactorB.load(
      document.header.id,
      "main",
      aGlobalOps.global.results,
    );
    const loadTokenB = await waitForJobCompletion(reactorB, info.id);

    const bOpsAfterLoad = await reactorB.getOperations(
      document.header.id,
      { branch: "main", scopes: ["global"] },
      undefined,
      undefined,
      loadTokenB,
    );

    expect(bOpsAfterLoad.global.results).toHaveLength(5);

    const bGlobalOps = await reactorB.getOperations(
      document.header.id,
      { branch: "main", scopes: ["global"] },
      undefined,
      undefined,
      loadTokenB,
    );

    info = await reactorA.load(
      document.header.id,
      "main",
      bGlobalOps.global.results,
    );
    const loadTokenA = await waitForJobCompletion(reactorA, info.id);

    const aOpsAfterLoad = await reactorA.getOperations(
      document.header.id,
      { branch: "main", scopes: ["global"] },
      undefined,
      undefined,
      loadTokenA,
    );

    expect(aOpsAfterLoad.global.results).toHaveLength(6);

    const resultA = await reactorA.get<DocumentModelDocument>(
      document.header.id,
      { branch: "main" },
    );
    const resultB = await reactorB.get<DocumentModelDocument>(
      document.header.id,
      { branch: "main" },
    );

    expect(resultA.state.global.name).toBe("B1");
    expect(resultB.state.global.name).toBe("B1");
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
