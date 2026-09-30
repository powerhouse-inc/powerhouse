import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  generateId,
  withSignaturePolicy,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { IReactor } from "../../src/core/types.js";
import { JobStatus } from "../../src/shared/types.js";
import { createDocModelDocument } from "../factories.js";

const MODELS = [
  documentModelDocumentModelModule as never,
  driveDocumentModelModule as never,
];

describe("loading a document's creation and deletion in one job", () => {
  const reactors: IReactor[] = [];

  afterEach(() => {
    for (const reactor of reactors.splice(0)) reactor.kill();
  });

  async function settled(reactor: IReactor, jobId: string) {
    await vi.waitUntil(
      async () => {
        const { status } = await reactor.getJobStatus(jobId);
        return status === JobStatus.READ_READY || status === JobStatus.FAILED;
      },
      { timeout: 3_000, interval: 20 },
    );
    return reactor.getJobStatus(jobId);
  }

  async function loadCreatedAndDeleted(documentDecisions: boolean) {
    const source = await new ReactorBuilder()
      .withDocumentModelSources(MODELS)
      .build();
    const target = await new ReactorBuilder()
      .withDocumentModelSources(MODELS)
      .withExecutorConfig({ featureFlags: { documentDecisions } })
      .build();
    reactors.push(source, target);
    const document = withSignaturePolicy(createDocModelDocument(), "legacy", {
      id: generateId(),
    });
    const id = document.header.id;
    await settled(source, (await source.create(document)).id);
    await settled(source, (await source.deleteDocument(id)).id);
    const ops = (
      await source.getOperations(id, { branch: "main", scopes: ["document"] })
    ).document!.results;
    expect(ops.map((op) => op.action.type)).toEqual([
      "CREATE_DOCUMENT",
      "UPGRADE_DOCUMENT",
      "DELETE_DOCUMENT",
    ]);

    const info = await settled(target, (await target.load(id, "main", ops)).id);
    expect(info.status, info.error?.message).toBe(JobStatus.READ_READY);
  }

  it("applies without documentDecisions", async () => {
    await loadCreatedAndDeleted(false);
  });

  // evaluateByPosition reads getState(-1) of the new id and defers on itself.
  it.fails("applies under documentDecisions", async () => {
    await loadCreatedAndDeleted(true);
  });
});
