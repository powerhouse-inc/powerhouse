import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  garbageCollect,
  garbageCollectV2,
  setModelName,
  addModule,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { IReactor } from "../../src/core/types.js";
import { JobStatus, type ConsistencyToken } from "../../src/shared/types.js";
import { createDocModelDocument } from "../factories.js";

/**
 * Positional auth evaluation reads each stream up to a timestamp, so it needs
 * the effective stream -- the one left after skips are applied -- to run in
 * timestamp order. The stored rows do not, because a reshuffle appends the
 * merged range and supersedes the rows it replaces rather than rewriting them.
 */
describe("effective stream timestamp order", () => {
  let reactorA: IReactor;
  let reactorB: IReactor;

  beforeEach(async () => {
    vi.useFakeTimers();
    reactorA = await new ReactorBuilder()
      .withDocumentModelSources([
        documentModelDocumentModelModule as any,
        driveDocumentModelModule as any,
      ])
      .build();
    reactorB = await new ReactorBuilder()
      .withDocumentModelSources([
        documentModelDocumentModelModule as any,
        driveDocumentModelModule as any,
      ])
      .build();
  });

  afterEach(() => {
    reactorA.kill();
    reactorB.kill();
    vi.useRealTimers();
  });

  async function settle(
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

  async function globalOps(reactor: IReactor, id: string, token?: unknown) {
    const res = await reactor.getOperations(
      id,
      { branch: "main", scopes: ["global"] },
      undefined,
      undefined,
      token as never,
    );
    return res.global.results;
  }

  it("is not ordered by timestamp in the stored rows", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const document = createDocModelDocument({
      id: "probe-doc",
      slug: "probe-doc",
    });

    // Both reactors hold the document.
    let info = await reactorA.create(document);
    const createToken = await settle(reactorA, info.id);
    const createOps = await reactorA.getOperations(
      document.header.id,
      { branch: "main", scopes: ["document"] },
      undefined,
      undefined,
      createToken,
    );
    info = await reactorB.load(
      document.header.id,
      "main",
      createOps.document.results,
    );
    await settle(reactorB, info.id);

    // A builds three global operations, all early.
    for (const name of ["A0", "A1", "A2"]) {
      vi.advanceTimersByTime(1000);
      const job = await reactorA.execute(document.header.id, "main", [
        setModelName({ name }),
      ]);
      await settle(reactorA, job.id);
    }
    const aOps = await globalOps(reactorA, document.header.id);

    // B builds two global operations, both later than every one of A's.
    vi.advanceTimersByTime(100_000);
    for (const name of ["B0", "B1"]) {
      vi.advanceTimersByTime(1000);
      const job = await reactorB.execute(document.header.id, "main", [
        setModelName({ name }),
      ]);
      await settle(reactorB, job.id);
    }

    // Load only A's last operation: its index (2) is above B's head (1) while
    // its timestamp is below both of B's.
    const lastA = aOps[aOps.length - 1];
    info = await reactorB.load(document.header.id, "main", [lastA]);
    const token = await settle(reactorB, info.id);

    const after = await globalOps(reactorB, document.header.id, token);
    const rows = after.map((op) => ({
      index: op.index,
      skip: op.skip,
      t: op.timestampUtcMs,
      name: (op.action.input as { name?: string }).name ?? op.action.type,
    }));

    // A load whose lowest incoming index sits above the local head takes the
    // trivial-append branch, so nothing is superseded and no skip is written.
    // The inversion therefore survives into the effective stream.
    expect(rows.map((r) => r.skip)).toEqual([0, 0, 0]);
    expect(rows.map((r) => r.name)).toEqual(["B0", "B1", "A2"]);
    expect(Date.parse(rows[2].t)).toBeLessThan(Date.parse(rows[1].t));
  });

  it("is ordered by timestamp once reshuffle skips are applied", async () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const document = createDocModelDocument({
      id: "probe-doc-2",
      slug: "probe-doc-2",
    });

    let info = await reactorA.create(document);
    const createToken = await settle(reactorA, info.id);
    const createOps = await reactorA.getOperations(
      document.header.id,
      { branch: "main", scopes: ["document"] },
      undefined,
      undefined,
      createToken,
    );
    info = await reactorB.load(
      document.header.id,
      "main",
      createOps.document.results,
    );
    await settle(reactorB, info.id);

    for (const name of ["A0", "A1", "A2"]) {
      vi.advanceTimersByTime(1000);
      const job = await reactorA.execute(document.header.id, "main", [
        addModule({ id: name, name }),
      ]);
      await settle(reactorA, job.id);
    }
    const aOps = await globalOps(reactorA, document.header.id);

    vi.advanceTimersByTime(100_000);
    for (const name of ["B0", "B1"]) {
      vi.advanceTimersByTime(1000);
      const job = await reactorB.execute(document.header.id, "main", [
        addModule({ id: name, name }),
      ]);
      await settle(reactorB, job.id);
    }

    // Everything A has, the way sync sends it.
    info = await reactorB.load(document.header.id, "main", aOps);
    const token = await settle(reactorB, info.id);

    const after = await globalOps(reactorB, document.header.id, token);
    const rows = after.map((op) => ({
      index: op.index,
      skip: op.skip,
      t: op.timestampUtcMs,
      name: (op.action.input as { name?: string }).name ?? op.action.type,
    }));

    const ascending = (ops: typeof after) =>
      ops.every(
        (o, i) =>
          i === 0 ||
          Date.parse(ops[i - 1].timestampUtcMs) <= Date.parse(o.timestampUtcMs),
      );

    // The reshuffle appended the merged range and put a skip on its first
    // operation, so the stored rows still carry the superseded prefix.
    expect(ascending(after)).toBe(false);
    expect(rows[2].skip).toBe(2);

    // Applying that skip leaves the merged range on its own, in timestamp order.
    const effective = garbageCollect(after) as typeof after;
    expect(
      effective.map((o) => (o.action.input as { name?: string }).name),
    ).toEqual(["A0", "A1", "A2", "B0", "B1"]);
    expect(ascending(effective)).toBe(true);

    // garbageCollectV2 only supersedes through NOOP markers, so it does not
    // collect a reshuffle, whose skip sits on a regular operation.
    expect(ascending(garbageCollectV2(after) as typeof after)).toBe(false);

    // The rebuild follows the effective stream, not the stored rows. ADD_MODULE
    // accumulates, so 5 rather than 7 is what says the skip was applied.
    const doc = await reactorB.get(document.header.id, { branch: "main" });
    const modules = (
      (
        doc.state as Record<
          string,
          { specifications?: { modules?: unknown[] }[] }
        >
      ).global.specifications?.[0]?.modules ?? []
    ).length;
    expect(modules).toBe(5);

    // The skip was applied on a document carrying base-reducer 2, which is the
    // only version the reactor stamps.
    expect(doc.header.protocolVersions).toEqual({ "base-reducer": 2 });
  });
});
