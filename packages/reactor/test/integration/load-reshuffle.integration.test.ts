import { ReactorBuilder, type IReactor } from "#index.js";
import { driveDocumentModelModule, MemoryStorage } from "document-drive";
import { documentModelDocumentModelModule, setName } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  });

  it("appends reshuffled operations with skip to the log", async () => {
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
    expect(aCreateOperations.document.results).toHaveLength(2);

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
    expect(bOperations.document.results).toHaveLength(2);

    const mutateJobA = await reactorA.execute(document.header.id, "main", [
      setName("A1"),
      setName("A2"),
      setName("A3"),
    ]);
    const tokenA = await waitForJobCompletion(reactorA, mutateJobA.id);

    const mutateJobB = await reactorB.execute(document.header.id, "main", [
      setName("B1"),
      setName("B2"),
    ]);
    const tokenB = await waitForJobCompletion(reactorB, mutateJobB.id);

    const aOperationsAfterMutate = await reactorA.getOperations(
      document.header.id,
      {
        branch: "main",
        scopes: ["global"],
      },
      undefined,
      tokenA,
    );
    expect(aOperationsAfterMutate.global.results).toHaveLength(3);

    const bOperationsBeforeLoad = await reactorB.getOperations(
      document.header.id,
      {
        branch: "main",
        scopes: ["global"],
      },
      undefined,
      tokenB,
    );
    expect(bOperationsBeforeLoad.global.results).toHaveLength(2);

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

    expect(bOperationsAfterLoad.global.results).toHaveLength(5);

    const bOpsWithSkip = bOperationsAfterLoad.global.results.filter(
      (op) => op.skip > 0,
    );
    expect(bOpsWithSkip.length).toBeGreaterThan(0);

    const firstLoadedOpIndex = bOperationsAfterLoad.global.results.findIndex(
      (op) => op.skip > 0,
    );
    expect(firstLoadedOpIndex).toBeGreaterThan(-1);

    const firstLoadedOp =
      bOperationsAfterLoad.global.results[firstLoadedOpIndex];
    expect(firstLoadedOp.skip).toBe(2);
    expect(firstLoadedOp.index).toBe(2);
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
