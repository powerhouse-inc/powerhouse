import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { Operation } from "@powerhousedao/shared/document-model";
import {
  addModule,
  garbageCollect,
  sortOperations,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { IReactor } from "../../src/core/types.js";
import { JobStatus, type ConsistencyToken } from "../../src/shared/types.js";
import { createDocModelDocument } from "../factories.js";

type AppliedOperation = {
  action: string;
  id?: string;
  denied: boolean;
  hash: string;
};

/**
 * A backdated delete refuses the operations after it on every replica. Each
 * replica reaching that answer on its own is not the same as two replicas
 * agreeing, so this syncs both directions and compares them.
 */
describe("convergence", () => {
  let deleter: IReactor;
  let writer: IReactor;

  async function build(): Promise<IReactor> {
    return new ReactorBuilder()
      .withDocumentModelSources([
        documentModelDocumentModelModule as never,
        driveDocumentModelModule as never,
      ])
      .withExecutorConfig({ featureFlags: { documentDecisions: true } })
      .build();
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    deleter?.kill();
    writer?.kill();
    vi.useRealTimers();
  });

  async function settle(
    reactor: IReactor,
    jobId: string,
  ): Promise<ConsistencyToken> {
    await vi.waitUntil(async () => {
      const status = await reactor.getJobStatus(jobId);
      return (
        status.status === JobStatus.FAILED ||
        status.status === JobStatus.READ_READY
      );
    });
    const status = await reactor.getJobStatus(jobId);
    if (status.status === JobStatus.FAILED) {
      throw new Error(status.error?.message ?? "job failed");
    }
    return status.consistencyToken;
  }

  async function operations(
    reactor: IReactor,
    documentId: string,
    scope: string,
    token?: ConsistencyToken,
  ): Promise<Operation[]> {
    const result = await reactor.getOperations(
      documentId,
      { branch: "main", scopes: [scope] },
      undefined,
      undefined,
      token,
    );
    return (result as Record<string, { results: Operation[] }>)[scope].results;
  }

  /**
   * The applied sequence: what a rebuild walks. The hash comes along because it
   * covers the state the operation leaves behind, so replicas that agree on the
   * sequence but not the hashes have not converged.
   */
  async function applied(
    reactor: IReactor,
    documentId: string,
    scope: string,
  ): Promise<AppliedOperation[]> {
    const stored = await operations(reactor, documentId, scope);
    return garbageCollect(sortOperations([...stored])).map((operation) => ({
      action: operation.action.type,
      id: (operation.action.input as { id?: string }).id,
      denied: operation.deniedReason !== undefined,
      hash: operation.hash,
    }));
  }

  it("reaches the same applied sequence and state from either direction", async () => {
    deleter = await build();
    writer = await build();

    const document = createDocModelDocument({ id: "convergence-doc" });
    const created = await deleter.create(document);
    const createToken = await settle(deleter, created.id);
    const docId = document.header.id;

    const createOps = await operations(deleter, docId, "document", createToken);
    await settle(writer, (await writer.load(docId, "main", createOps)).id);

    // The writer builds history either side of a delete it does not have yet.
    vi.setSystemTime(new Date("2026-01-01T00:00:00.500Z"));
    const beforeJob = await writer.execute(docId, "main", [
      addModule({ id: "before", name: "before" }),
    ]);
    await settle(writer, beforeJob.id);

    vi.setSystemTime(new Date("2026-01-01T00:00:20.000Z"));
    const afterJob = await writer.execute(docId, "main", [
      addModule({ id: "after", name: "after" }),
    ]);
    await settle(writer, afterJob.id);

    // The deleter deletes between those two timestamps, knowing neither.
    vi.setSystemTime(new Date("2026-01-01T00:00:01.000Z"));
    const deleteJob = await deleter.deleteDocument(docId);
    const deleteToken = await settle(deleter, deleteJob.id);

    const deleteOps = (
      await operations(deleter, docId, "document", deleteToken)
    ).filter((operation) => operation.action.type === "DELETE_DOCUMENT");
    const writerGlobal = await operations(writer, docId, "global");

    // The writer re-evaluates history it already committed; the deleter
    // evaluates the same operations as they arrive. Two different routes.
    await settle(writer, (await writer.load(docId, "main", deleteOps)).id);
    await settle(deleter, (await deleter.load(docId, "main", writerGlobal)).id);

    // The writer's stream now carries the rows re-evaluation appended. Sending
    // it on is what sync does, and must leave the receiver where it already is.
    const reappended = await operations(writer, docId, "global");
    await settle(deleter, (await deleter.load(docId, "main", reappended)).id);

    const writerGlobalApplied = await applied(writer, docId, "global");

    // Stated absolutely too, so the replicas cannot agree on a wrong answer.
    expect(
      writerGlobalApplied.map(({ id, denied }) => ({ id, denied })),
    ).toEqual([
      { id: "before", denied: false },
      { id: "after", denied: true },
    ]);

    expect(await applied(deleter, docId, "global")).toEqual(
      writerGlobalApplied,
    );

    expect(await applied(deleter, docId, "document")).toEqual(
      await applied(writer, docId, "document"),
    );
  });
});
