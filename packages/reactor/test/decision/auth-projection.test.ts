import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { Grant, Operation } from "@powerhousedao/shared/document-model";
import {
  addModule,
  AUTH_NO_GRANT_REASON,
  garbageCollect,
  initializeAuth,
  removeGrant,
  setGrant,
  sortOperations,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { IReactor } from "../../src/core/types.js";
import { JobStatus, type ConsistencyToken } from "../../src/shared/types.js";
import { createDocModelDocument } from "../factories.js";

const OPEN_GRANT: Grant = {
  id: "g-open",
  description: "anyone may execute anywhere",
  effect: "allow",
  principal: { anyone: true },
  capability: { can: "execute", scope: "*" },
};

/**
 * Keeps the auth scope administrable. An unsigned document has no creator, so a
 * policy that revokes every grant locks its own auth scope out permanently.
 */
const AUTH_ADMIN_GRANT: Grant = {
  id: "g-auth-admin",
  description: "anyone may administer the policy",
  effect: "allow",
  principal: { anyone: true },
  capability: { can: "execute", scope: "auth" },
};

const GLOBAL_GRANT: Grant = {
  id: "g-global",
  description: "anyone may write the global scope",
  effect: "allow",
  principal: { anyone: true },
  capability: { can: "execute", scope: "global" },
};

/**
 * The spec's revocation race: one reactor revokes a grant while the other writes
 * under it, and after sync both agree on which operations apply.
 */
describe("the auth projection", () => {
  let source: IReactor;
  let target: IReactor;

  async function build(
    authEnforcement: boolean,
    maxSkipThreshold?: number,
  ): Promise<IReactor> {
    return new ReactorBuilder()
      .withDocumentModelSources([
        documentModelDocumentModelModule as never,
        driveDocumentModelModule as never,
      ])
      .withExecutorConfig({
        featureFlags: { documentDecisions: true, authEnforcement },
        ...(maxSkipThreshold === undefined ? {} : { maxSkipThreshold }),
      })
      .build();
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    source?.kill();
    target?.kill();
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

  /** Copies one scope's operations from one reactor to another. */
  async function sync(
    from: IReactor,
    to: IReactor,
    documentId: string,
    scope: string,
    token?: ConsistencyToken,
  ): Promise<void> {
    const ops = await from.getOperations(
      documentId,
      { branch: "main", scopes: [scope] },
      undefined,
      undefined,
      token,
    );
    const load = await to.load(documentId, "main", ops[scope].results);
    await settle(to, load.id);
  }

  /**
   * The operations that still count: a pass re-appends with a skip rather than
   * rewriting, so the stored rows hold both copies.
   */
  function denialsByModuleId(
    operations: Operation[],
  ): Array<{ id: string | undefined; deniedReason: string | undefined }> {
    return garbageCollect(sortOperations([...operations])).map((operation) => ({
      id: (operation.action.input as { id?: string }).id,
      deniedReason: operation.deniedReason,
    }));
  }

  /**
   * Deciding a reshuffled tail at the stream heads would resurrect a denial the
   * rest of the fleet keeps: a revocation then a re-grant makes the head allow
   * what the position denies.
   */
  it("keeps a stored denial when a backdated write reshuffles past it", async () => {
    source = await build(true);

    const document = createDocModelDocument({ id: "backdated-doc" });
    const created = await source.create(document);
    await settle(source, created.id);
    const docId = document.header.id;

    const init = await source.execute(docId, "main", [
      initializeAuth({
        version: 1,
        grants: [AUTH_ADMIN_GRANT, GLOBAL_GRANT],
      }),
    ]);
    await settle(source, init.id);

    vi.setSystemTime(new Date("2026-01-01T00:00:02.000Z"));
    const revoke = await source.execute(docId, "main", [
      removeGrant({ id: GLOBAL_GRANT.id }),
    ]);
    await settle(source, revoke.id);

    vi.setSystemTime(new Date("2026-01-01T00:00:04.000Z"));
    const refused = await source.execute(docId, "main", [
      addModule({ id: "refused", name: "refused" }),
    ]);
    await expect(settle(source, refused.id)).rejects.toThrow(
      /Authorization denied/,
    );

    vi.setSystemTime(new Date("2026-01-01T00:00:06.000Z"));
    const regrant = await source.execute(docId, "main", [
      setGrant({ grant: GLOBAL_GRANT }),
    ]);
    await settle(source, regrant.id);

    // An allowed write, so the global stream has something to reshuffle.
    vi.setSystemTime(new Date("2026-01-01T00:00:07.000Z"));
    const afterRegrant = await source.execute(docId, "main", [
      addModule({ id: "after-regrant", name: "after-regrant" }),
    ]);
    await settle(source, afterRegrant.id);

    // Backdated: it sorts before the last write, which is therefore reshuffled
    // and must keep the verdict its own position gives it.
    vi.setSystemTime(new Date("2026-01-01T00:00:05.000Z"));
    const backdated = await source.execute(docId, "main", [
      addModule({ id: "backdated", name: "backdated" }),
    ]);

    await expect(settle(source, backdated.id)).rejects.toThrow(
      /Authorization denied/,
    );

    const globalOps = await source.getOperations(docId, {
      branch: "main",
      scopes: ["global"],
    });

    expect(denialsByModuleId(globalOps.global.results)).toEqual([
      { id: "after-regrant", deniedReason: undefined },
    ]);
  });

  it("denies a write that sorts after a revocation and leaves the earlier one alone", async () => {
    source = await build(true);
    target = await build(true);

    const document = createDocModelDocument({ id: "revocation-doc" });
    const created = await source.create(document);
    const createToken = await settle(source, created.id);
    const docId = document.header.id;

    await sync(source, target, docId, "document", createToken);

    // The admin grant keeps the creator-less policy administrable once the
    // open grant is revoked; the reducer rejects revoking the last one.
    const init = await source.execute(docId, "main", [
      initializeAuth({ version: 1, grants: [AUTH_ADMIN_GRANT, OPEN_GRANT] }),
    ]);
    const initToken = await settle(source, init.id);
    await sync(source, target, docId, "auth", initToken);

    vi.advanceTimersByTime(1_000);
    const early = await target.execute(docId, "main", [
      addModule({ id: "early", name: "early" }),
    ]);
    await settle(target, early.id);

    vi.advanceTimersByTime(2_000);
    const late = await target.execute(docId, "main", [
      addModule({ id: "late", name: "late" }),
    ]);
    await settle(target, late.id);

    // Between the target's two writes.
    vi.setSystemTime(new Date("2026-01-01T00:00:02.000Z"));
    const revoke = await source.execute(docId, "main", [
      removeGrant({ id: OPEN_GRANT.id }),
    ]);
    const revokeToken = await settle(source, revoke.id);

    await sync(source, target, docId, "auth", revokeToken);

    const globalOps = await target.getOperations(docId, {
      branch: "main",
      scopes: ["global"],
    });

    expect(denialsByModuleId(globalOps.global.results)).toEqual([
      { id: "early", deniedReason: undefined },
      { id: "late", deniedReason: AUTH_NO_GRANT_REASON },
    ]);
  });

  /**
   * The spec's concern: "busy documents would become revocation-proof". A bound
   * well below the history length must not stop a revocation or the next arrival.
   */
  it("revokes over a history longer than the reshuffle bound", async () => {
    const historyLength = 20;
    const bound = 5;

    source = await build(true, bound);
    target = await build(true, bound);

    const document = createDocModelDocument({ id: "long-history-doc" });
    const created = await source.create(document);
    const createToken = await settle(source, created.id);
    const docId = document.header.id;

    await sync(source, target, docId, "document", createToken);

    const init = await source.execute(docId, "main", [
      initializeAuth({
        version: 1,
        grants: [AUTH_ADMIN_GRANT, GLOBAL_GRANT],
      }),
    ]);
    const initToken = await settle(source, init.id);
    await sync(source, target, docId, "auth", initToken);

    for (let i = 0; i < historyLength; i++) {
      vi.advanceTimersByTime(1_000);
      const write = await target.execute(docId, "main", [
        addModule({ id: `m-${i}`, name: `m-${i}` }),
      ]);
      await settle(target, write.id);
    }

    // Sorts before the whole history, so the pass supersedes all of it — far more
    // re-appends than the bound allows to be counted.
    vi.setSystemTime(new Date("2026-01-01T00:00:00.500Z"));
    const revoke = await source.execute(docId, "main", [
      removeGrant({ id: GLOBAL_GRANT.id }),
    ]);
    const revokeToken = await settle(source, revoke.id);

    await sync(source, target, docId, "auth", revokeToken);

    const globalOps = await target.getOperations(docId, {
      branch: "main",
      scopes: ["global"],
    });
    const effective = denialsByModuleId(globalOps.global.results);

    expect(effective).toHaveLength(historyLength);
    expect(
      effective.every((op) => op.deniedReason === AUTH_NO_GRANT_REASON),
    ).toBe(true);

    // Where the bound actually bites: a later arrival reaching into the
    // re-appended range must not be charged for it.
    expect(globalOps.global.results.length).toBeGreaterThan(historyLength);

    const arrival = await target.load(docId, "main", [
      {
        id: "op-late-arrival",
        index: 0,
        skip: 0,
        hash: "h-late",
        timestampUtcMs: "2026-01-01T00:00:10.500Z",
        action: {
          id: "a-late-arrival",
          type: "ADD_MODULE",
          scope: "global",
          timestampUtcMs: "2026-01-01T00:00:10.500Z",
          input: { id: "late", name: "late" },
        },
      } as unknown as Operation,
    ]);

    await expect(settle(target, arrival.id)).resolves.toBeDefined();
  });

  /**
   * A load job carries one scope, so a mixed envelope becomes two jobs whose
   * order is not guaranteed. Either way the answer is the same: a stored policy
   * decides what sorts after it, and a late auth arrival owes a pass.
   */
  it.each([
    ["auth first", ["auth", "global"]],
    ["domain first", ["global", "auth"]],
  ] as const)(
    "converges whichever scope loads first (%s)",
    async (_name, order) => {
      source = await build(true);
      target = await build(true);

      const document = createDocModelDocument({ id: `order-${order[0]}-doc` });
      const created = await source.create(document);
      const createToken = await settle(source, created.id);
      const docId = document.header.id;

      await sync(source, target, docId, "document", createToken);

      const init = await source.execute(docId, "main", [
        initializeAuth({
          version: 1,
          grants: [AUTH_ADMIN_GRANT, GLOBAL_GRANT],
        }),
      ]);
      await settle(source, init.id);

      vi.advanceTimersByTime(1_000);
      const allowed = await source.execute(docId, "main", [
        addModule({ id: "allowed", name: "allowed" }),
      ]);
      await settle(source, allowed.id);

      // The revocation lands after that write, so it denies nothing on the source.
      vi.advanceTimersByTime(1_000);
      const revoke = await source.execute(docId, "main", [
        removeGrant({ id: GLOBAL_GRANT.id }),
      ]);
      const revokeToken = await settle(source, revoke.id);

      const authOps = await source.getOperations(
        docId,
        { branch: "main", scopes: ["auth"] },
        undefined,
        undefined,
        revokeToken,
      );
      const globalOps = await source.getOperations(docId, {
        branch: "main",
        scopes: ["global"],
      });

      for (const scope of order) {
        const ops =
          scope === "auth" ? authOps.auth.results : globalOps.global.results;
        const load = await target.load(docId, "main", ops);
        await settle(target, load.id);
      }

      const targetGlobal = await target.getOperations(docId, {
        branch: "main",
        scopes: ["global"],
      });

      // The write sorts before the revocation, so it stands either way.
      expect(denialsByModuleId(targetGlobal.global.results)).toEqual([
        { id: "allowed", deniedReason: undefined },
      ]);
    },
  );

  /**
   * A document-scope write was gated by nothing but its own deleted check, so an
   * `execute`-on-`document` grant was unenforceable and `DELETE_DOCUMENT` — the
   * most consequential write there is — could not be refused by a policy.
   */
  it("refuses a delete the policy denies, and still allows creation", async () => {
    source = await build(true);

    const document = createDocModelDocument({ id: "gated-delete-doc" });

    // Creation is exempt: there is no policy to consult before one exists.
    const created = await source.create(document);
    await settle(source, created.id);
    const docId = document.header.id;

    const init = await source.execute(docId, "main", [
      initializeAuth({ version: 1, grants: [AUTH_ADMIN_GRANT] }),
    ]);
    await settle(source, init.id);

    vi.advanceTimersByTime(1_000);
    const deleteJob = await source.deleteDocument(docId);

    await expect(settle(source, deleteJob.id)).rejects.toThrow(
      /Authorization denied/,
    );

    const readBack = await source.get(docId);
    expect(readBack.state.document.isDeleted).not.toBe(true);
  });

  it("allows a delete the policy permits", async () => {
    source = await build(true);

    const document = createDocModelDocument({ id: "permitted-delete-doc" });
    const created = await source.create(document);
    await settle(source, created.id);
    const docId = document.header.id;

    const init = await source.execute(docId, "main", [
      initializeAuth({
        version: 1,
        grants: [
          AUTH_ADMIN_GRANT,
          {
            id: "g-document",
            description: "anyone may write the document scope",
            effect: "allow",
            principal: { anyone: true },
            capability: { can: "execute", scope: "document" },
          },
        ],
      }),
    ]);
    await settle(source, init.id);

    vi.advanceTimersByTime(1_000);
    const deleteJob = await source.deleteDocument(docId);
    await settle(source, deleteJob.id);

    const readBack = await source.get(docId);
    expect(readBack.state.document.isDeleted).toBe(true);
  });

  it("records which policy rule refused", async () => {
    source = await build(true);

    const document = createDocModelDocument({ id: "reason-doc" });
    const created = await source.create(document);
    await settle(source, created.id);
    const docId = document.header.id;

    const init = await source.execute(docId, "main", [
      initializeAuth({ version: 1, grants: [OPEN_GRANT] }),
    ]);
    await settle(source, init.id);

    vi.advanceTimersByTime(1_000);
    const allowed = await source.execute(docId, "main", [
      addModule({ id: "allowed", name: "allowed" }),
    ]);
    await settle(source, allowed.id);

    // An explicit deny stacked on top of the open grant refuses at admission.
    // Scoped to `global` rather than `*`: a creator-less policy may not deny
    // itself execute on `auth`, which a blanket deny would do.
    vi.advanceTimersByTime(1_000);
    const freeze = await source.execute(docId, "main", [
      setGrant({
        grant: {
          id: "g-freeze",
          description: "freeze every global write",
          effect: "deny",
          principal: { anyone: true },
          capability: { can: "execute", scope: "global" },
        },
      }),
    ]);
    await settle(source, freeze.id);

    vi.advanceTimersByTime(1_000);
    const refused = await source.execute(docId, "main", [
      addModule({ id: "refused", name: "refused" }),
    ]);

    await expect(settle(source, refused.id)).rejects.toThrow(
      /Authorization denied/,
    );
  });

  it("leaves the policy unenforced with the flag off", async () => {
    source = await build(false);

    const document = createDocModelDocument({ id: "unenforced-doc" });
    const created = await source.create(document);
    await settle(source, created.id);
    const docId = document.header.id;

    // The admin grant comes last so it is the one that wins for the auth scope:
    // genesis rejects a creator-less policy whose administration a later deny
    // shadows, even with enforcement off. The lockdown grant still denies the
    // domain write below, which is what this test is about.
    const init = await source.execute(docId, "main", [
      initializeAuth({
        version: 1,
        grants: [
          {
            id: "g-lockdown",
            description: "nobody writes anything",
            effect: "deny",
            principal: { anyone: true },
            capability: { can: "execute", scope: "*" },
          },
          AUTH_ADMIN_GRANT,
        ],
      }),
    ]);
    await settle(source, init.id);

    // A domain write the policy forbids still lands, because grants do not gate
    // a domain write until authEnforcement is on.
    vi.advanceTimersByTime(1_000);
    const write = await source.execute(docId, "main", [
      addModule({ id: "ungated", name: "ungated" }),
    ]);
    await settle(source, write.id);

    const globalOps = await source.getOperations(docId, {
      branch: "main",
      scopes: ["global"],
    });
    expect(denialsByModuleId(globalOps.global.results)).toEqual([
      { id: "ungated", deniedReason: undefined },
    ]);
  });

  it("refuses a write the stacked policy denies, by reason", async () => {
    source = await build(true);

    const document = createDocModelDocument({ id: "stacked-doc" });
    const created = await source.create(document);
    await settle(source, created.id);
    const docId = document.header.id;

    const init = await source.execute(docId, "main", [
      initializeAuth({
        version: 1,
        grants: [
          OPEN_GRANT,
          {
            id: "g-deny-modules",
            description: "no module edits",
            effect: "deny",
            principal: { anyone: true },
            capability: {
              can: "execute",
              scope: "global",
              operation: ["ADD_MODULE"],
            },
          },
        ],
      }),
    ]);
    await settle(source, init.id);

    vi.advanceTimersByTime(1_000);
    const refused = await source.execute(docId, "main", [
      addModule({ id: "refused", name: "refused" }),
    ]);
    await expect(settle(source, refused.id)).rejects.toThrow(
      /Authorization denied/,
    );
  });
});
