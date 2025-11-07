import { ReactorBuilder, type IReactor } from "#index.js";
import { driveDocumentModelModule, MemoryStorage } from "document-drive";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JobStatus, type ConsistencyToken } from "../../src/shared/types.js";
import { createDocModelDocument } from "../factories.js";

describe("Load reshuffle integration", () => {
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
      .withLegacyStorage(new MemoryStorage())
      .withReadModelCoordinatorFactory(() => {
        return {
          start: vi.fn(),
          stop: vi.fn(),
        };
      });

    reactorA = await builderA.build();

    const builderB = new ReactorBuilder()
      .withDocumentModels([
        documentModelDocumentModelModule as any,
        driveDocumentModelModule as any,
      ])
      .withFeatures({
        legacyStorageEnabled: false,
      })
      .withLegacyStorage(new MemoryStorage())
      .withReadModelCoordinatorFactory(() => {
        return {
          start: vi.fn(),
          stop: vi.fn(),
        };
      });

    reactorB = await builderB.build();
  });

  afterEach(() => {
    reactorA.kill();
    reactorB.kill();
  });

  it("appends reshuffled operations with skip to the log", async () => {
    // create on reactor A
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
      },
      undefined,
      createTokenA,
    );
    expect(aCreateOperations.document.results).toHaveLength(2);
    // eslint-disable-next-line no-console
    console.log(
      "load ops action types",
      aCreateOperations.document.results.map((op) => op.action.type),
    );

    // forward to reactor B

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
    expect(bOperations.document.results).toHaveLength(2); /*

    const mutateJob = await reactorA.mutate(document.header.id, "main", [
      setName("A1"),
      setName("A2"),
      setName("A3"),
    ]);
    const tokenA = await waitForJobCompletion(reactorA, mutateJob.id);

    const aOperations = await reactorA.getOperations(
      document.header.id,
      {
        branch: "main",
        scopes: ["global"],
      },
      undefined,
      tokenA,
    );
    expect(aOperations.global.results).toHaveLength(3);*/
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
    return status.status === JobStatus.COMPLETED;
  });

  const status = await reactor.getJobStatus(jobId);
  return status.consistencyToken;
}
