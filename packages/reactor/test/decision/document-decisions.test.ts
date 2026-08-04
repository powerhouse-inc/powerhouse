import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import { setModelName } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { IReactor } from "../../src/core/types.js";
import { JobStatus, type ConsistencyToken } from "../../src/shared/types.js";
import { createDocModelDocument } from "../factories.js";

/**
 * With the flag off the executor reads the deleted flag from the document meta
 * cache; with it on the executor builds a decision model over the document
 * stream. Both refuse an operation on a deleted document, so turning the flag on
 * must not change what callers see -- only how the evaluation is made, and that
 * the write now carries a read-set the store enforces.
 */
describe("document decisions", () => {
  let reactor: IReactor | undefined;

  afterEach(() => {
    reactor?.kill();
    reactor = undefined;
    vi.useRealTimers();
  });

  async function build(documentDecisions: boolean): Promise<IReactor> {
    const builder = new ReactorBuilder()
      .withDocumentModelSources([
        documentModelDocumentModelModule as never,
        driveDocumentModelModule as never,
      ])
      .withExecutorConfig({ featureFlags: { documentDecisions } });
    return builder.build();
  }

  async function settle(
    target: IReactor,
    jobId: string,
  ): Promise<ConsistencyToken> {
    await vi.waitUntil(async () => {
      const status = await target.getJobStatus(jobId);
      if (status.status === JobStatus.FAILED) {
        return true;
      }
      return status.status === JobStatus.READ_READY;
    });
    const status = await target.getJobStatus(jobId);
    if (status.status === JobStatus.FAILED) {
      throw new Error(status.error?.message ?? "job failed");
    }
    return status.consistencyToken;
  }

  async function createDocument(target: IReactor) {
    const document = createDocModelDocument({
      id: `doc-${Math.floor(performance.now() * 1000)}`,
    });
    const info = await target.create(document);
    await settle(target, info.id);
    return document.header.id;
  }

  it.each([false, true])(
    "admits an operation on a live document (flag %s)",
    async (documentDecisions) => {
      reactor = await build(documentDecisions);
      const docId = await createDocument(reactor);

      const job = await reactor.execute(docId, "main", [
        setModelName({ name: "ok" }),
      ]);
      await settle(reactor, job.id);

      const result = await reactor.get(docId, { branch: "main" });
      expect(
        (result.state as Record<string, { name?: string }>).global.name,
      ).toBe("ok");
    },
  );

  it.each([false, true])(
    "refuses an operation on a deleted document (flag %s)",
    async (documentDecisions) => {
      reactor = await build(documentDecisions);
      const docId = await createDocument(reactor);

      const deleteJob = await reactor.deleteDocument(docId);
      await settle(reactor, deleteJob.id);

      const job = await reactor.execute(docId, "main", [
        setModelName({ name: "after delete" }),
      ]);

      await expect(settle(reactor, job.id)).rejects.toThrow(/deleted/i);
    },
  );
});
