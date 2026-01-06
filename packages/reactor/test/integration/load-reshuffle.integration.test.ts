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
      finalTokenB,
    );

    expect(bOperationsAfterLoad.global.results).toHaveLength(3);

    const result = await reactorB.get<DocumentModelDocument>(
      document.header.id,
      {
        branch: "main",
      },
    );
    expect(result.document.state.global.name).toBe("B1");
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
