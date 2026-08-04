import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { Operation } from "@powerhousedao/shared/document-model";
import {
  garbageCollect,
  sortOperations,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { IReactor } from "../../src/core/types.js";
import { JobStatus, type ConsistencyToken } from "../../src/shared/types.js";
import { createDocModelDocument } from "../factories.js";

/**
 * Creation holds the first two indexes for the life of the document, so no
 * reshuffle may include it however far back the conflicting range reaches.
 */
describe("genesis is never reshuffled", () => {
  let local: IReactor;
  let remote: IReactor;

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
    local?.kill();
    remote?.kill();
    vi.useRealTimers();
  });

  async function settle(r: IReactor, jobId: string): Promise<ConsistencyToken> {
    await vi.waitUntil(async () => {
      const s = await r.getJobStatus(jobId);
      return s.status === JobStatus.FAILED || s.status === JobStatus.READ_READY;
    });
    const s = await r.getJobStatus(jobId);
    if (s.status === JobStatus.FAILED) {
      throw new Error(s.error?.message ?? "job failed");
    }
    return s.consistencyToken;
  }

  async function documentOps(
    r: IReactor,
    id: string,
    token?: ConsistencyToken,
  ): Promise<Operation[]> {
    const res = await r.getOperations(
      id,
      { branch: "main", scopes: ["document"] },
      undefined,
      undefined,
      token,
    );
    return res.document.results;
  }

  /** Type and index, because the rule is that creation does not move. */
  function applied(list: Operation[]): Array<{ type: string; index: number }> {
    return garbageCollect(sortOperations([...list])).map((o) => ({
      type: o.action.type,
      index: o.index,
    }));
  }

  it("accepts a load carrying operations the replica already holds", async () => {
    local = await build();
    remote = await build();

    const document = createDocModelDocument({ id: "genesis-load-doc" });
    const created = await local.create(document);
    const createToken = await settle(local, created.id);
    const docId = document.header.id;

    await settle(
      remote,
      (
        await remote.load(
          docId,
          "main",
          await documentOps(local, docId, createToken),
        )
      ).id,
    );

    vi.setSystemTime(new Date("2026-01-01T00:00:10.000Z"));
    await settle(
      local,
      (await local.addRelationship(docId, "target-late", "child")).id,
    );

    vi.setSystemTime(new Date("2026-01-01T00:00:05.000Z"));
    const remoteToken = await settle(
      remote,
      (await remote.addRelationship(docId, "target-early", "child")).id,
    );

    // The whole stream is sent, creation included, rather than only what the
    // replica is missing.
    await settle(
      local,
      (
        await local.load(
          docId,
          "main",
          await documentOps(remote, docId, remoteToken),
        )
      ).id,
    );

    const rows = applied(await documentOps(local, docId));
    expect(rows.slice(0, 2)).toEqual([
      { type: "CREATE_DOCUMENT", index: 0 },
      { type: "UPGRADE_DOCUMENT", index: 1 },
    ]);
    expect(rows.slice(2).map((r) => r.type)).toEqual([
      "ADD_RELATIONSHIP",
      "ADD_RELATIONSHIP",
    ]);
  });

  it("accepts a local write timestamped at the document's creation", async () => {
    local = await build();

    const document = createDocModelDocument({ id: "genesis-write-doc" });
    const created = await local.create(document);
    await settle(local, created.id);
    const docId = document.header.id;

    vi.setSystemTime(new Date("2026-01-01T00:00:10.000Z"));
    await settle(
      local,
      (await local.addRelationship(docId, "target-late", "child")).id,
    );

    // Back at the creation timestamp, so the conflicting range reaches genesis.
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    await settle(
      local,
      (await local.addRelationship(docId, "target-genesis", "child")).id,
    );

    const rows = applied(await documentOps(local, docId));
    expect(rows.slice(0, 2)).toEqual([
      { type: "CREATE_DOCUMENT", index: 0 },
      { type: "UPGRADE_DOCUMENT", index: 1 },
    ]);
    expect(rows.slice(2).map((r) => r.type)).toEqual([
      "ADD_RELATIONSHIP",
      "ADD_RELATIONSHIP",
    ]);
  });
});
