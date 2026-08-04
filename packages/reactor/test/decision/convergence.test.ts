import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { Grant, Operation } from "@powerhousedao/shared/document-model";
import {
  addModule,
  AUTH_NO_GRANT_REASON,
  garbageCollect,
  initializeAuth,
  removeGrant,
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

  async function build(authEnforcement = false): Promise<IReactor> {
    return new ReactorBuilder()
      .withDocumentModelSources([
        documentModelDocumentModelModule as never,
        driveDocumentModelModule as never,
      ])
      .withExecutorConfig({
        featureFlags: { documentDecisions: true, authEnforcement },
      })
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

  it.each([false, true])(
    "reaches the same applied sequence and state from either direction (authEnforcement %s)",
    async (authEnforcement) => {
      deleter = await build(authEnforcement);
      writer = await build(authEnforcement);

      const document = createDocModelDocument({ id: "convergence-doc" });
      const created = await deleter.create(document);
      const createToken = await settle(deleter, created.id);
      const docId = document.header.id;

      const createOps = await operations(
        deleter,
        docId,
        "document",
        createToken,
      );
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
      await settle(
        deleter,
        (await deleter.load(docId, "main", writerGlobal)).id,
      );

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
    },
  );

  /**
   * The stage's exit criterion: two reactors that accept conflicting domain
   * operations offline converge to identical decisions and state, both
   * directions. Each reached a different answer on its own first.
   */
  it("converges on a revocation race in both directions", async () => {
    const admin: Grant = {
      id: "g-auth-admin",
      description: "anyone may administer the policy",
      effect: "allow",
      principal: { anyone: true },
      capability: { can: "execute", scope: "auth" },
    };
    const global: Grant = {
      id: "g-global",
      description: "anyone may write the global scope",
      effect: "allow",
      principal: { anyone: true },
      capability: { can: "execute", scope: "global" },
    };

    deleter = await build(true);
    writer = await build(true);
    const revoker = deleter;

    const document = createDocModelDocument({ id: "revocation-race-doc" });
    const created = await revoker.create(document);
    const createToken = await settle(revoker, created.id);
    const docId = document.header.id;

    const createOps = await operations(revoker, docId, "document", createToken);
    await settle(writer, (await writer.load(docId, "main", createOps)).id);

    const init = await revoker.execute(docId, "main", [
      initializeAuth({ version: 1, grants: [admin, global] }),
    ]);
    const initToken = await settle(revoker, init.id);
    const initOps = await operations(revoker, docId, "auth", initToken);
    await settle(writer, (await writer.load(docId, "main", initOps)).id);

    // Offline, under the grant it still holds.
    vi.setSystemTime(new Date("2026-01-01T00:10:05.000Z"));
    const write = await writer.execute(docId, "main", [
      addModule({ id: "assistant-write", name: "assistant-write" }),
    ]);
    await settle(writer, write.id);

    // Offline, before that write.
    vi.setSystemTime(new Date("2026-01-01T00:10:00.000Z"));
    const revoke = await revoker.execute(docId, "main", [
      removeGrant({ id: global.id }),
    ]);
    const revokeToken = await settle(revoker, revoke.id);

    const revokeOps = await operations(revoker, docId, "auth", revokeToken);
    const writerGlobal = await operations(writer, docId, "global");

    await settle(writer, (await writer.load(docId, "main", revokeOps)).id);
    await settle(revoker, (await revoker.load(docId, "main", writerGlobal)).id);

    // The re-appended rows travel on, and must leave the revoker put.
    const reappended = await operations(writer, docId, "global");
    await settle(revoker, (await revoker.load(docId, "main", reappended)).id);

    const writerApplied = await applied(writer, docId, "global");

    // Denied even on the replica that originally accepted it.
    expect(writerApplied.map(({ id, denied }) => ({ id, denied }))).toEqual([
      { id: "assistant-write", denied: true },
    ]);

    expect(await applied(revoker, docId, "global")).toEqual(writerApplied);
    expect(await applied(revoker, docId, "auth")).toEqual(
      await applied(writer, docId, "auth"),
    );

    // Same reason on both, since the reason is consensus data.
    const revokerGlobal = await operations(revoker, docId, "global");
    const reasons = new Set(
      garbageCollect(sortOperations([...revokerGlobal])).map(
        (operation) => operation.deniedReason,
      ),
    );
    expect(reasons).toEqual(new Set([AUTH_NO_GRANT_REASON]));
  });
});
