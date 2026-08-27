import type { Operation } from "@powerhousedao/shared/document-model";
import {
  addModule,
  deriveOperationId,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { IReactor } from "../../src/core/types.js";
import { JobStatus } from "../../src/shared/types.js";
import { createDocModelDocument } from "../factories.js";

/** Earlier than every local operation, so an incoming write always sorts first. */
const INCOMING_TS = "2026-01-01T00:00:01.000Z";
const LOCAL_TS = "2026-01-01T00:00:02.000Z";

/**
 * A reshuffle hands its whole skip to whichever operation sorts first and
 * zeroes every other one. A NOOP is the v2 undo marker and carries no rank of
 * its own, so it sorts first as readily as anything else does -- and the skip
 * it is handed then spans everything the reshuffle retired, which is not the
 * marker's own 1.
 */
describe("the skip a load job leaves on a NOOP", () => {
  let reactor: IReactor;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    reactor?.kill();
    vi.useRealTimers();
  });

  async function settle(jobId: string): Promise<string | undefined> {
    await vi.waitUntil(async () => {
      const status = await reactor.getJobStatus(jobId);
      return (
        status.status === JobStatus.FAILED ||
        status.status === JobStatus.READ_READY
      );
    });
    const status = await reactor.getJobStatus(jobId);
    return status.status === JobStatus.FAILED
      ? (status.error?.message ?? "job failed")
      : undefined;
  }

  async function globalOps(documentId: string): Promise<Operation[]> {
    const result = await reactor.getOperations(documentId, {
      branch: "main",
      scopes: ["global"],
    });
    return (
      (result as Record<string, { results: Operation[] } | undefined>).global
        ?.results ?? []
    );
  }

  /** An operation as a peer would send it, stamped ahead of the local stream. */
  function incoming(
    documentId: string,
    index: number,
    action: { id: string; type: string; input: unknown },
  ): Operation {
    return {
      id: deriveOperationId(documentId, "global", "main", action.id),
      index,
      skip: action.type === "NOOP" ? 1 : 0,
      hash: "",
      timestampUtcMs: INCOMING_TS,
      action: {
        ...action,
        scope: "global",
        timestampUtcMs: INCOMING_TS,
      },
    } as unknown as Operation;
  }

  /**
   * A document holding one operation and an undo of it. The undo leaves a NOOP
   * marker with skip 1 at the head, and the load that follows has both
   * revisions to retire.
   */
  async function undoneDocument(id: string): Promise<string> {
    const document = createDocModelDocument({ id });
    expect(await settle((await reactor.create(document)).id)).toBeUndefined();

    vi.setSystemTime(new Date(LOCAL_TS));
    expect(
      await settle(
        (
          await reactor.execute(document.header.id, "main", [
            addModule({ id: "m0", name: "m0" }),
          ])
        ).id,
      ),
    ).toBeUndefined();

    expect(
      await settle(
        (
          await reactor.execute(document.header.id, "main", [
            { type: "UNDO", scope: "global", input: {} } as never,
          ])
        ).id,
      ),
    ).toBeUndefined();

    return document.header.id;
  }

  beforeEach(async () => {
    reactor = await new ReactorBuilder()
      .withDocumentModelSources([documentModelDocumentModelModule as never])
      .build();
  });

  it("keeps the reshuffle's skip when the NOOP sorts first", async () => {
    const docId = await undoneDocument("noop-sorts-first");

    const before = await globalOps(docId);
    // The marker as the undo wrote it: one operation retired, at the head.
    expect(before.find((op) => op.action.type === "NOOP")?.skip).toBe(1);

    // A NOOP from a peer, earlier than everything local, so it sorts first and
    // the reshuffle hands it the whole batch skip. Its index is below the local
    // head, so the load reshuffles rather than appending.
    const load = await reactor.load(docId, "main", [
      incoming(docId, 0, {
        id: "incoming-noop",
        type: "NOOP",
        input: {},
      }),
    ]);
    expect(await settle(load.id)).toBeUndefined();

    const after = await globalOps(docId);
    const sortedFirst = after.find((op) => op.action.id === "incoming-noop");
    expect(sortedFirst).toBeDefined();

    // Two local revisions were retired, so the skip is 2. Overwritten with the
    // marker's own 1 it stops covering what the reshuffle retired, and that
    // operation reads back as live history on the next round.
    expect(sortedFirst?.skip).toBe(2);
  });

  it("restores the marker skip when the reshuffle zeroed it", async () => {
    const docId = await undoneDocument("noop-sorts-later");

    const localNoopId = (await globalOps(docId)).find(
      (op) => op.action.type === "NOOP",
    )?.action.id;
    expect(localNoopId).toBeDefined();

    // An ordinary operation sorts first this time and takes the batch skip, so
    // the local NOOP is re-appended behind it with its skip zeroed like every
    // other non-first write.
    const load = await reactor.load(docId, "main", [
      incoming(docId, 0, {
        id: "incoming-module",
        type: "ADD_MODULE",
        input: { id: "m1", name: "m1" },
      }),
    ]);
    expect(await settle(load.id)).toBeUndefined();

    const after = await globalOps(docId);
    expect(after.find((op) => op.action.id === "incoming-module")?.skip).toBe(
      2,
    );

    // Left at zero the marker would undo nothing: the rebuild reads the flag,
    // not the count, and only treats a NOOP as a marker while the skip is
    // positive. This is why the loop that restores it exists.
    const reappended = after.filter((op) => op.action.id === localNoopId).pop();
    expect(reappended?.skip).toBe(1);
  });
});
