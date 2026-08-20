import type { SyncOperation, SyncScopeGate } from "@powerhousedao/reactor";
import type { AuthSubject } from "@powerhousedao/shared/document-model";
import { describe, expect, it, vi } from "vitest";
import { collectHeldSyncOperations } from "../src/graphql/reactor/resolvers.js";

const SUBJECT: AuthSubject = { address: "0xreader" };
const META = ["auth", "document"];

function syncOp(
  id: string,
  documentId: string,
  scopes: string[],
  branch = "main",
): SyncOperation {
  return { id, documentId, scopes, branch } as unknown as SyncOperation;
}

/**
 * A gate that serves the named scopes of the named documents and nothing else,
 * counting how often it was asked.
 */
function fakeGate(served: Record<string, string[]>): SyncScopeGate & {
  scopePredicateById: ReturnType<typeof vi.fn>;
} {
  const gate = {
    scopePredicateById: vi
      .fn()
      .mockImplementation((documentId: string) =>
        Promise.resolve((scope: string) =>
          (served[documentId] ?? []).includes(scope),
        ),
      ),
  };
  return gate as unknown as SyncScopeGate & {
    scopePredicateById: ReturnType<typeof vi.fn>;
  };
}

describe("collecting the entries a poll's subject may not read", () => {
  it("holds an entry whose only scope is withheld", async () => {
    const held = await collectHeldSyncOperations(
      [syncOp("s-1", "doc-1", ["global"])],
      fakeGate({ "doc-1": META }),
      SUBJECT,
    );

    expect([...held]).toEqual(["s-1"]);
  });

  it("serves an entry whose scope the policy allows", async () => {
    const held = await collectHeldSyncOperations(
      [syncOp("s-1", "doc-1", ["global"])],
      fakeGate({ "doc-1": [...META, "global"] }),
      SUBJECT,
    );

    expect(held.size).toBe(0);
  });

  it("never holds an always-readable scope of a withheld document", async () => {
    const held = await collectHeldSyncOperations(
      [
        syncOp("s-auth", "doc-1", ["auth"]),
        syncOp("s-doc", "doc-1", ["document"]),
        syncOp("s-global", "doc-1", ["global"]),
      ],
      fakeGate({ "doc-1": META }),
      SUBJECT,
    );

    expect([...held]).toEqual(["s-global"]);
  });

  it("decides each document on its own policy", async () => {
    const held = await collectHeldSyncOperations(
      [
        syncOp("s-1", "doc-open", ["global"]),
        syncOp("s-2", "doc-closed", ["global"]),
      ],
      fakeGate({ "doc-open": [...META, "global"], "doc-closed": META }),
      SUBJECT,
    );

    expect([...held]).toEqual(["s-2"]);
  });

  /** A dead letter can name several scopes; one readable scope serves it. */
  it("holds a multi-scope entry only when every scope is withheld", async () => {
    const gate = fakeGate({ "doc-1": [...META, "local"] });

    const partly = await collectHeldSyncOperations(
      [syncOp("s-1", "doc-1", ["global", "local"])],
      gate,
      SUBJECT,
    );
    const wholly = await collectHeldSyncOperations(
      [syncOp("s-2", "doc-1", ["global", "other"])],
      gate,
      SUBJECT,
    );

    expect(partly.size).toBe(0);
    expect([...wholly]).toEqual(["s-2"]);
  });

  it("reads a document's policy once however many entries name it", async () => {
    const gate = fakeGate({ "doc-1": META });

    await collectHeldSyncOperations(
      [
        syncOp("s-1", "doc-1", ["global"]),
        syncOp("s-2", "doc-1", ["global"]),
        syncOp("s-3", "doc-1", ["local"]),
      ],
      gate,
      SUBJECT,
    );

    expect(gate.scopePredicateById).toHaveBeenCalledTimes(1);
  });

  it("reads a branch's policy separately from another branch's", async () => {
    const gate = fakeGate({ "doc-1": META });

    await collectHeldSyncOperations(
      [
        syncOp("s-1", "doc-1", ["global"], "main"),
        syncOp("s-2", "doc-1", ["global"], "draft"),
      ],
      gate,
      SUBJECT,
    );

    expect(gate.scopePredicateById).toHaveBeenCalledTimes(2);
    expect(gate.scopePredicateById).toHaveBeenCalledWith(
      "doc-1",
      SUBJECT,
      "draft",
      undefined,
    );
  });

  it("surfaces a failure to read a policy rather than serving anything", async () => {
    const gate = {
      scopePredicateById: vi
        .fn()
        .mockRejectedValue(new Error("read side down")),
    } as unknown as SyncScopeGate;

    await expect(
      collectHeldSyncOperations(
        [syncOp("s-1", "doc-1", ["global"])],
        gate,
        SUBJECT,
      ),
    ).rejects.toThrow("read side down");
  });

  it("holds nothing when there is nothing to poll", async () => {
    const held = await collectHeldSyncOperations([], fakeGate({}), SUBJECT);

    expect(held.size).toBe(0);
  });
});
