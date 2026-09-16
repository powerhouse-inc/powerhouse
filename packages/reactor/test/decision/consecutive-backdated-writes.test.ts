import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import {
  addFile,
  driveCreateDocument,
  driveDocumentModelModule,
} from "@powerhousedao/shared/document-drive";
import type { Action, Operation } from "@powerhousedao/shared/document-model";
import {
  garbageCollect,
  sortOperations,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { IReactor } from "../../src/core/types.js";
import { JobStatus } from "../../src/shared/types.js";

/**
 * A local write stamped earlier than operations already stored lands before them:
 * they are retracted and re-appended after it. When a second backdated write
 * follows, the run it reshuffles already holds the first reshuffle -- the
 * originals that reshuffle retracted, their re-appended copies, and the first
 * backdated write, which is older than the second one.
 *
 * Issue #3021: that second reshuffle retracted the first backdated write without
 * re-appending it, and re-appended the retracted originals next to their own
 * copies, so one file disappeared from the drive and two were added twice.
 */
describe("consecutive backdated writes", () => {
  const driveId = "consecutive-backdated-drive";
  let reactor: IReactor;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    reactor?.kill();
    vi.useRealTimers();
  });

  async function settle(jobId: string): Promise<void> {
    await vi.waitUntil(async () => {
      const status = await reactor.getJobStatus(jobId);
      return (
        status.status === JobStatus.READ_READY ||
        status.status === JobStatus.FAILED
      );
    });
    const status = await reactor.getJobStatus(jobId);
    if (status.status === JobStatus.FAILED) {
      throw new Error(status.error?.message ?? "job failed");
    }
  }

  function at(action: Action, timestampUtcMs: string): Action {
    return { ...action, timestampUtcMs };
  }

  /**
   * Adds one file per entry to a fresh drive, in array order, each stamped with
   * its own timestamp, and reads back what the drive serves and what its global
   * stream reduces to.
   */
  async function addFilesInArrivalOrder(
    files: Array<{ id: string; timestampUtcMs: string }>,
  ) {
    reactor = await new ReactorBuilder()
      .withDocumentModelSources([
        documentModelDocumentModelModule as never,
        driveDocumentModelModule as never,
      ])
      .withExecutorConfig({ featureFlags: { documentDecisions: true } })
      .build();

    const drive = driveCreateDocument({
      global: { name: "Drive", icon: null, nodes: [] },
    });
    drive.header.id = driveId;
    drive.header.slug = driveId;
    const created = await reactor.create(drive);
    await settle(created.id);

    for (const file of files) {
      const job = await reactor.execute(driveId, "main", [
        at(
          addFile({ id: file.id, name: file.id, documentType: "test/doc" }),
          file.timestampUtcMs,
        ),
      ]);
      await settle(job.id);
    }

    const served = await reactor.get<DocumentDriveDocument>(driveId);
    const stored = (
      await reactor.getOperations(driveId, {
        branch: "main",
        scopes: ["global"],
      })
    ).global.results;
    const effective = garbageCollect(
      sortOperations([...stored] as Operation[]),
    );

    return {
      servedIds: served.state.global.nodes.map((node) => node.id).sort(),
      effectiveIds: effective.map(
        (operation) =>
          (operation.action.input as { id?: string } | undefined)?.id ?? "",
      ),
      errors: effective
        .map((operation) => operation.error)
        .filter((error) => error !== undefined),
    };
  }

  it("keeps the first backdated write when a second one follows", async () => {
    const { servedIds, effectiveIds, errors } = await addFilesInArrivalOrder([
      { id: "a", timestampUtcMs: "2026-01-01T00:00:00.300Z" },
      { id: "b", timestampUtcMs: "2026-01-01T00:00:00.400Z" },
      { id: "x", timestampUtcMs: "2026-01-01T00:00:00.100Z" },
      { id: "y", timestampUtcMs: "2026-01-01T00:00:00.200Z" },
    ]);

    expect(servedIds).toEqual(["a", "b", "x", "y"]);
    expect(effectiveIds).toEqual(["x", "y", "a", "b"]);
    expect(errors).toEqual([]);
  });

  it("keeps every write across three backdated writes in a row", async () => {
    const { servedIds, effectiveIds, errors } = await addFilesInArrivalOrder([
      { id: "a", timestampUtcMs: "2026-01-01T00:00:00.500Z" },
      { id: "b", timestampUtcMs: "2026-01-01T00:00:00.600Z" },
      { id: "x", timestampUtcMs: "2026-01-01T00:00:00.100Z" },
      { id: "y", timestampUtcMs: "2026-01-01T00:00:00.300Z" },
      { id: "z", timestampUtcMs: "2026-01-01T00:00:00.200Z" },
    ]);

    expect(servedIds).toEqual(["a", "b", "x", "y", "z"]);
    expect(effectiveIds).toEqual(["x", "z", "y", "a", "b"]);
    expect(errors).toEqual([]);
  });
});
