import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { Action, Operation } from "@powerhousedao/shared/document-model";
import {
  addModule,
  garbageCollect,
  sortOperations,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { IReactor } from "../../src/core/types.js";
import { JobStatus } from "../../src/shared/types.js";
import { createDocModelDocument } from "../factories.js";

/**
 * A submitted batch is positioned by the earliest timestamp it carries, and a
 * caller may stamp its actions at second precision. Mixed precision inverts a
 * lexical comparison -- ".500Z" sorts before "00Z" because "." is 0x2E and "Z"
 * is 0x5A -- so selecting the batch minimum as a string picks the later
 * instant, and a genuinely backdated action reads as current.
 */
describe("positioning a batch by its earliest timestamp", () => {
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

  it("positions a second-precision action that is behind the stored head", async () => {
    reactor = await new ReactorBuilder()
      .withDocumentModelSources([
        documentModelDocumentModelModule as never,
        driveDocumentModelModule as never,
      ])
      .withExecutorConfig({ featureFlags: { documentDecisions: true } })
      .build();

    const document = createDocModelDocument({ id: "mixed-precision-doc" });
    const created = await reactor.create(document);
    await settle(created.id);
    const docId = document.header.id;

    // Stored head sits between the two timestamps the batch carries.
    const stored = await reactor.execute(docId, "main", [
      at(
        addModule({ id: "stored", name: "stored" }),
        "2026-01-01T00:00:00.200Z",
      ),
    ]);
    await settle(stored.id);

    // "…:00Z" is 00.000 -- the earliest instant here, and behind the stored
    // head -- but it sorts last of the three as a string.
    const batch = await reactor.execute(docId, "main", [
      at(
        addModule({ id: "backdated", name: "backdated" }),
        "2026-01-01T00:00:00Z",
      ),
      at(addModule({ id: "later", name: "later" }), "2026-01-01T00:00:00.500Z"),
    ]);
    await settle(batch.id);

    const result = await reactor.getOperations(docId, {
      branch: "main",
      scopes: ["global"],
    });
    const effective = garbageCollect(
      sortOperations([...result.global.results] as Operation[]),
    );

    // The invariant positional evaluation depends on: the effective stream is
    // ascending by timestamp, so a single forward walk over it is correct.
    const times = effective.map((operation) =>
      Date.parse(operation.timestampUtcMs),
    );
    expect(times).toEqual([...times].sort((a, b) => a - b));

    // and the backdated action landed before the operation it precedes
    const ids = effective.map(
      (operation) =>
        (operation.action.input as { id?: string } | undefined)?.id ?? "",
    );
    expect(ids.indexOf("backdated")).toBeLessThan(ids.indexOf("stored"));
  });
});
