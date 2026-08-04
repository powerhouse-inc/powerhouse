import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { Grant, Operation } from "@powerhousedao/shared/document-model";
import {
  addModule,
  initializeAuth,
  setGrant,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { IReactor } from "../../src/core/types.js";
import { firstOutOfOrderPair } from "../../src/decision/stream-order.js";
import { JobStatus, type ConsistencyToken } from "../../src/shared/types.js";
import { createDocModelDocument } from "../factories.js";

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
 * The auth stream holds no ties, so no arbitrary tie-break decides authority. The
 * rule is deliberately asymmetric: the replica ahead rejects the arrival rather
 * than granting authority its own policy never granted.
 */
describe("the monotonic auth timestamp rule", () => {
  let reactor: IReactor;
  let other: IReactor;

  async function build(authEnforcement: boolean): Promise<IReactor> {
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
    reactor?.kill();
    other?.kill();
    vi.useRealTimers();
  });

  async function settle(
    target: IReactor,
    jobId: string,
  ): Promise<ConsistencyToken> {
    await vi.waitUntil(async () => {
      const status = await target.getJobStatus(jobId);
      return (
        status.status === JobStatus.FAILED ||
        status.status === JobStatus.READ_READY
      );
    });
    const status = await target.getJobStatus(jobId);
    if (status.status === JobStatus.FAILED) {
      throw new Error(status.error?.message ?? "job failed");
    }
    return status.consistencyToken;
  }

  async function authInitializedDocument(
    target: IReactor,
    id: string,
  ): Promise<string> {
    const document = createDocModelDocument({ id });
    const created = await target.create(document);
    await settle(target, created.id);

    const init = await target.execute(document.header.id, "main", [
      initializeAuth({
        version: 1,
        grants: [AUTH_ADMIN_GRANT, GLOBAL_GRANT],
      }),
    ]);
    await settle(target, init.id);

    return document.header.id;
  }

  it("rejects a locally submitted auth write that does not exceed the newest", async () => {
    reactor = await build(true);
    const docId = await authInitializedDocument(reactor, "monotonic-local");

    // Stamped before the INITIALIZE_AUTH already stored.
    vi.setSystemTime(new Date("2025-12-31T23:59:59.000Z"));
    const backdated = await reactor.execute(docId, "main", [
      setGrant({
        grant: { ...GLOBAL_GRANT, description: "backdated rewrite" },
      }),
    ]);

    await expect(settle(reactor, backdated.id)).rejects.toThrow(
      /Auth timestamp not monotonic/,
    );
  });

  it("rejects an auth write stamped at exactly the newest timestamp", async () => {
    reactor = await build(true);
    const docId = await authInitializedDocument(reactor, "monotonic-tie");

    // Wound back exactly, because settling advances the fake clock. The rule is
    // strictly greater, so an equal timestamp is refused.
    const stored = await reactor.getOperations(docId, {
      branch: "main",
      scopes: ["auth"],
    });
    const newest = stored.auth.results[0].timestampUtcMs;
    vi.setSystemTime(new Date(newest));

    const tied = await reactor.execute(docId, "main", [
      setGrant({ grant: { ...GLOBAL_GRANT, description: "tied" } }),
    ]);

    await expect(settle(reactor, tied.id)).rejects.toThrow(
      /Auth timestamp not monotonic/,
    );
  });

  // Two actions built in one tick share a millisecond, which comparing each
  // against one stored maximum would let through.
  it("rejects a batch whose own auth actions share a timestamp", async () => {
    reactor = await build(true);

    const document = createDocModelDocument({ id: "monotonic-batch" });
    const created = await reactor.create(document);
    await settle(reactor, created.id);
    const docId = document.header.id;

    const batch = await reactor.execute(docId, "main", [
      initializeAuth({ version: 1, grants: [AUTH_ADMIN_GRANT] }),
      setGrant({ grant: GLOBAL_GRANT }),
    ]);

    await expect(settle(reactor, batch.id)).rejects.toThrow(
      /Auth timestamp not monotonic/,
    );
  });

  it("accepts an auth write that strictly exceeds the newest", async () => {
    reactor = await build(true);
    const docId = await authInitializedDocument(reactor, "monotonic-forward");

    vi.advanceTimersByTime(1_000);
    const later = await reactor.execute(docId, "main", [
      setGrant({ grant: { ...GLOBAL_GRANT, description: "later" } }),
    ]);
    await settle(reactor, later.id);

    const authOps = await reactor.getOperations(docId, {
      branch: "main",
      scopes: ["auth"],
    });
    expect(authOps.auth.results).toHaveLength(2);
  });

  it("leaves the auth stream in timestamp order", async () => {
    reactor = await build(true);
    const docId = await authInitializedDocument(reactor, "monotonic-ordered");

    for (let i = 1; i <= 3; i++) {
      vi.advanceTimersByTime(1_000);
      const write = await reactor.execute(docId, "main", [
        setGrant({ grant: { ...GLOBAL_GRANT, description: `v${i}` } }),
      ]);
      await settle(reactor, write.id);
    }

    const authOps = await reactor.getOperations(docId, {
      branch: "main",
      scopes: ["auth"],
    });
    expect(firstOutOfOrderPair(authOps.auth.results)).toBeUndefined();
  });

  /**
   * A re-append is not an arrival: it keeps its original timestamp, so the rule
   * must not apply or a refusal could never retract the tail it invalidated.
   */
  it("does not reject a re-appended auth operation, which keeps its timestamp", async () => {
    reactor = await build(true);
    other = await build(true);

    const document = createDocModelDocument({ id: "monotonic-reappend" });
    const created = await reactor.create(document);
    const createToken = await settle(reactor, created.id);
    const docId = document.header.id;

    const docOps = await reactor.getOperations(
      docId,
      { branch: "main", scopes: ["document"] },
      undefined,
      undefined,
      createToken,
    );
    const loadCreate = await other.load(docId, "main", docOps.document.results);
    await settle(other, loadCreate.id);

    const init = await reactor.execute(docId, "main", [
      initializeAuth({
        version: 1,
        grants: [AUTH_ADMIN_GRANT, GLOBAL_GRANT],
      }),
    ]);
    const initToken = await settle(reactor, init.id);
    const authOps = await reactor.getOperations(
      docId,
      { branch: "main", scopes: ["auth"] },
      undefined,
      undefined,
      initToken,
    );
    const loadAuth = await other.load(docId, "main", authOps.auth.results);
    await settle(other, loadAuth.id);

    vi.advanceTimersByTime(5_000);
    const domain = await other.execute(docId, "main", [
      addModule({ id: "m", name: "m" }),
    ]);
    await settle(other, domain.id);

    // Sorts before the domain write, so it triggers a pass that re-appends it.
    vi.setSystemTime(new Date("2026-01-01T00:00:03.000Z"));
    const revoke = await reactor.execute(docId, "main", [
      setGrant({
        grant: {
          id: "g-freeze",
          description: "freeze the global scope",
          effect: "deny",
          principal: { anyone: true },
          capability: { can: "execute", scope: "global" },
        },
      }),
    ]);
    const revokeToken = await settle(reactor, revoke.id);

    const revokeOps = await reactor.getOperations(
      docId,
      { branch: "main", scopes: ["auth"] },
      undefined,
      undefined,
      revokeToken,
    );

    // Accepted, and the pass it triggers does not trip the rule.
    const loadRevoke = await other.load(docId, "main", revokeOps.auth.results);
    await settle(other, loadRevoke.id);

    const otherAuth = await other.getOperations(docId, {
      branch: "main",
      scopes: ["auth"],
    });
    expect(firstOutOfOrderPair(otherAuth.auth.results)).toBeUndefined();
  });

  it("does not apply the rule with authEnforcement off", async () => {
    reactor = await build(false);
    const docId = await authInitializedDocument(reactor, "monotonic-flag-off");

    // The same tie lands, because nothing enforces the rule.
    const stored = await reactor.getOperations(docId, {
      branch: "main",
      scopes: ["auth"],
    });
    vi.setSystemTime(new Date(stored.auth.results[0].timestampUtcMs));

    const tied = await reactor.execute(docId, "main", [
      setGrant({ grant: { ...GLOBAL_GRANT, description: "tied" } }),
    ]);
    await settle(reactor, tied.id);

    const authOps = await reactor.getOperations(docId, {
      branch: "main",
      scopes: ["auth"],
    });
    expect(authOps.auth.results).toHaveLength(2);
  });
});
