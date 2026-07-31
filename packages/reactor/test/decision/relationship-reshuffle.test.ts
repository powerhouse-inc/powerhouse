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

describe("relationship reshuffle", () => {
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

  it("supersedes the relationship it re-appends", async () => {
    local = await build();
    remote = await build();

    const document = createDocModelDocument({ id: "rel-reshuffle-doc" });
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

    // The local reactor relates late, and also writes a domain operation later
    // still, so the document's newest timestamp does not come from this scope.
    vi.setSystemTime(new Date("2026-01-01T00:00:10.000Z"));
    await settle(
      local,
      (await local.addRelationship(docId, "target-late", "child")).id,
    );

    vi.setSystemTime(new Date("2026-01-01T00:00:25.000Z"));
    await settle(
      local,
      (await local.execute(docId, "main", [addModule({ id: "m", name: "m" })]))
        .id,
    );

    // The remote relates earlier, so its arrival reshuffles the document scope.
    vi.setSystemTime(new Date("2026-01-01T00:00:05.000Z"));
    const remoteToken = await settle(
      remote,
      (await remote.addRelationship(docId, "target-early", "child")).id,
    );

    const incoming = (await documentOps(remote, docId, remoteToken)).filter(
      (o) => o.action.type === "ADD_RELATIONSHIP",
    );
    await settle(local, (await local.load(docId, "main", incoming)).id);

    const applied = garbageCollect(
      sortOperations([...(await documentOps(local, docId))]),
    ).map((o) => ({
      type: o.action.type,
      target: (o.action.input as { targetId?: string }).targetId,
    }));

    // Each relationship appears once, in timestamp order.
    expect(applied).toEqual([
      { type: "CREATE_DOCUMENT", target: undefined },
      { type: "UPGRADE_DOCUMENT", target: undefined },
      { type: "ADD_RELATIONSHIP", target: "target-early" },
      { type: "ADD_RELATIONSHIP", target: "target-late" },
    ]);
  });

  it("owes a pass when the newest timestamp is not the last-indexed operation", async () => {
    local = await build();

    const document = createDocModelDocument({ id: "latest-timestamp-doc" });
    const created = await local.create(document);
    await settle(local, created.id);
    const docId = document.header.id;

    // A relationship at t=10 sits behind the delete once the delete is appended,
    // so the newest timestamp is not on the last-indexed operation.
    vi.setSystemTime(new Date("2026-01-01T00:00:10.000Z"));
    await settle(
      local,
      (await local.addRelationship(docId, "target", "child")).id,
    );

    vi.setSystemTime(new Date("2026-01-01T00:00:20.000Z"));
    const afterJob = await local.execute(docId, "main", [
      addModule({ id: "after", name: "after" }),
    ]);
    await settle(local, afterJob.id);

    vi.setSystemTime(new Date("2026-01-01T00:00:05.000Z"));
    await settle(local, (await local.deleteDocument(docId)).id);

    const global = await local.getOperations(docId, {
      branch: "main",
      scopes: ["global"],
    });
    expect(
      garbageCollect(sortOperations([...global.global.results])).map((o) => ({
        id: (o.action.input as { id?: string }).id,
        denied: o.deniedReason !== undefined,
      })),
    ).toEqual([{ id: "after", denied: true }]);
  });
});
