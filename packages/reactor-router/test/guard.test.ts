import { describe, expect, it } from "vitest";
import {
  isMisroute,
  misrouteOf,
  WRONG_SHARD_CODE,
  WrongBackendError,
} from "../src/errors.js";
import { withOwnershipGuard } from "../src/guard.js";
import { FakeReactor, fakeDocument, inProcessCapabilities } from "./stubs.js";

function guarded(name: string): FakeReactor {
  return new FakeReactor(name, inProcessCapabilities(name));
}

describe("withOwnershipGuard", () => {
  it("refuses a write for a document it does not hold, structurally", async () => {
    const reactor = guarded("one");
    const client = reactor.backend().client;

    const refused = client.execute("missing-doc", "main", []);

    await expect(refused).rejects.toThrow(WrongBackendError);
    const error = await refused.catch((value: unknown) => value);
    expect(misrouteOf(error)).toMatchObject({
      misrouted: true,
      documentId: "missing-doc",
      rejectedBy: "one",
    });
  });

  it("lets a write through for a document it holds", async () => {
    const reactor = guarded("one");
    reactor.seed(fakeDocument({ id: "doc-1" }));

    const renamed = await reactor.backend().client.rename("doc-1", "new name");

    expect(renamed.header.name).toBe("new name");
  });

  it("refuses a soft-deleted document's owner nothing: a taken id is owned", async () => {
    const reactor = guarded("one");
    const client = withOwnershipGuard(
      reactor.backend({ guard: false }).client,
      {
        backendName: "one",
        // A store where the document is no longer served but its id is taken.
        owns: (identifier) => Promise.resolve(identifier === "deleted-doc"),
      },
    );

    await expect(client.deleteDocument("deleted-doc")).rejects.toThrow(
      /found no document/,
    );
    // The refusal above came from the underlying stub, not from the guard: the
    // guard admitted it, which is the point.
    expect(reactor.called("deleteDocument")).toBe(true);
  });

  it("guards the drives surface too", async () => {
    const reactor = guarded("one");

    await expect(
      reactor.backend().client.drives.addFolder("missing-drive", "folder"),
    ).rejects.toThrow(WrongBackendError);
    expect(reactor.called("drives.addFolder")).toBe(false);
  });

  it("guards every document of a batch and of a multi-delete", async () => {
    const reactor = guarded("one");
    reactor.seed(fakeDocument({ id: "mine" }));

    await expect(
      reactor.backend().client.executeBatch({
        jobs: [
          {
            key: "a",
            documentId: "mine",
            scope: "global",
            branch: "main",
            actions: [],
            dependsOn: [],
          },
          {
            key: "b",
            documentId: "theirs",
            scope: "global",
            branch: "main",
            actions: [],
            dependsOn: [],
          },
        ],
      }),
    ).rejects.toThrow(WrongBackendError);
    expect(reactor.called("executeBatch")).toBe(false);

    await expect(
      reactor.backend().client.deleteDocuments(["mine", "theirs"]),
    ).rejects.toThrow(WrongBackendError);
    expect(reactor.called("deleteDocuments")).toBe(false);
  });

  it("does NOT guard reads, so a fan-in can still ask every backend", async () => {
    const reactor = guarded("one");

    // The stub refuses because it has no such document -- a plain not-found,
    // not a misroute. A guarded read would have made the tolerant fan-in
    // impossible.
    const read = reactor.backend().client.isServed("missing");

    await expect(read).resolves.toBe(false);
    const edges = reactor
      .backend()
      .client.getOutgoingRelationshipEdges("missing");
    await expect(edges).rejects.toThrow(/found no document/);
    expect(isMisroute(await edges.catch((value: unknown) => value))).toBe(
      false,
    );
  });

  it("does NOT guard creation: the document does not exist yet", async () => {
    const reactor = guarded("one");

    const created = await reactor.backend().client.createEmpty("test/document");

    expect(created.header.id).toBeTruthy();
  });
});

describe("misrouteOf", () => {
  it("recognises a live error", () => {
    const error = new WrongBackendError({
      collectionId: "drive.main.drive-a",
      documentId: "doc-1",
      ownerHint: "two",
      rejectedBy: "one",
      operation: "execute",
    });

    expect(misrouteOf(error)).toMatchObject({
      misrouted: true,
      collectionId: "drive.main.drive-a",
      documentId: "doc-1",
      ownerHint: "two",
      rejectedBy: "one",
    });
  });

  it("recognises one that lost its prototype and custom fields", () => {
    const original = new WrongBackendError({
      collectionId: "drive.main.drive-a",
      documentId: "doc-1",
      ownerHint: "two",
      rejectedBy: "one",
      operation: "execute",
    });
    // What survives reactor-browser's RPC boundary and `structuredClone`: the
    // name and the message, nothing else.
    const crossed = new Error(original.message);
    crossed.name = original.name;

    expect(misrouteOf(crossed)).toMatchObject({
      misrouted: true,
      collectionId: "drive.main.drive-a",
      documentId: "doc-1",
      ownerHint: "two",
      rejectedBy: "one",
    });
  });

  it("recognises a reactor-api wrong-shard body", () => {
    expect(
      misrouteOf({ error: WRONG_SHARD_CODE, driveId: "drive-a" }),
    ).toMatchObject({ misrouted: true, documentId: "drive-a" });
  });

  it("treats anything else as not a misroute", () => {
    expect(isMisroute(new Error("document not found"))).toBe(false);
    expect(isMisroute(undefined)).toBe(false);
    expect(isMisroute("wrong-backend")).toBe(false);
  });
});
