import { DriveCollectionId } from "@powerhousedao/reactor";
import { describe, expect, it } from "vitest";
import { ATTEMPT, RouteDispatcher } from "../src/dispatcher.js";
import { MisrouteUnresolvedError, WrongBackendError } from "../src/errors.js";
import type { ReactorBackend } from "../src/types.js";
import { FakeReactor, fakeDocument, inProcessCapabilities } from "./stubs.js";

const silent = (): void => {};

function reactor(name: string): FakeReactor {
  return new FakeReactor(name, inProcessCapabilities(name));
}

/**
 * The invariant this file exists for: **a wrong table never loses, duplicates
 * or misplaces a write.** Every test here starts from a table that is WRONG on
 * purpose and asserts where the operation actually landed, where it did not,
 * and what the router believes afterwards.
 */
describe("advisory routing", () => {
  it("lands a write on the owner even when the table names the wrong backend", async () => {
    const one = reactor("one");
    const two = reactor("two");
    one.seed(fakeDocument({ id: "drive-a", name: "A" }));
    const reported: string[] = [];
    const dispatcher = new RouteDispatcher([one.backend(), two.backend()], {
      // Deliberately wrong: drive-a is on "one".
      collections: { "drive-a": "two" },
      onDiagnostic: (message) => reported.push(message),
    });

    const renamed = await dispatcher.onCollection(
      "rename",
      "drive-a",
      "main",
      (backend) => backend.client.rename("drive-a", "renamed"),
      ATTEMPT.write,
    );

    // The write landed, exactly once, on the reactor that owns the drive.
    expect(renamed.header.name).toBe("renamed");
    expect(one.calls.filter((call) => call.method === "rename")).toHaveLength(
      1,
    );
    // And never reached the wrong one: its guard refused before forwarding.
    expect(two.called("rename")).toBe(false);
    // The table corrected itself, so the next operation costs no retry.
    expect(
      dispatcher.table.collectionRoute(DriveCollectionId.forDrive("drive-a")),
    ).toMatchObject({ backend: "one", source: "corrected" });
    expect(reported.join()).toMatch(
      /override for drive.main.drive-a names two/,
    );
  });

  it("does not repeat the refusal on the next operation", async () => {
    const one = reactor("one");
    const two = reactor("two");
    one.seed(fakeDocument({ id: "drive-a" }));
    const dispatcher = new RouteDispatcher([one.backend(), two.backend()], {
      collections: { "drive-a": "two" },
      onDiagnostic: silent,
    });
    const rename = (name: string): Promise<unknown> =>
      dispatcher.onCollection(
        "rename",
        "drive-a",
        "main",
        (backend) => backend.client.rename("drive-a", name),
        ATTEMPT.write,
      );

    await rename("first");
    const refusalsAfterFirst = two.calls.length;
    await rename("second");

    expect(two.calls.length).toBe(refusalsAfterFirst);
    expect(one.calls.filter((call) => call.method === "rename")).toHaveLength(
      2,
    );
  });

  it("follows an owner hint without probing", async () => {
    const one = reactor("one");
    const two = reactor("two");
    one.seed(fakeDocument({ id: "doc-1" }));
    const hinting: ReactorBackend = {
      name: "two",
      capabilities: two.capabilities,
      client: {
        isServed: () => Promise.resolve(false),
        isDocumentIdTaken: () => Promise.resolve(false),
        rename: () =>
          Promise.reject(
            new WrongBackendError({
              documentId: "doc-1",
              ownerHint: "one",
              rejectedBy: "two",
              operation: "rename",
            }),
          ),
      } as unknown as ReactorBackend["client"],
    };
    const dispatcher = new RouteDispatcher([hinting, one.backend()], {
      documents: { "doc-1": "two" },
      onDiagnostic: silent,
    });

    const renamed = await dispatcher.onDocument(
      "rename",
      "doc-1",
      (backend) => backend.client.rename("doc-1", "hinted"),
      ATTEMPT.write,
    );

    expect(renamed.header.name).toBe("hinted");
    expect(dispatcher.table.documentBackend("doc-1")).toBe("one");
  });

  it("refuses, rather than resolving, when every backend refuses", async () => {
    const one = reactor("one");
    const two = reactor("two");
    const dispatcher = new RouteDispatcher([one.backend(), two.backend()], {
      onDiagnostic: silent,
    });

    const run = dispatcher.onDocument(
      "rename",
      "nobody-has-this",
      (backend) => backend.client.rename("nobody-has-this", "x"),
      ATTEMPT.write,
    );

    await expect(run).rejects.toThrow(MisrouteUnresolvedError);
    await expect(run).rejects.toThrow(/refused by every backend/);
    expect(one.called("rename")).toBe(false);
    expect(two.called("rename")).toBe(false);
  });

  it("never retries a WRITE that failed without a structured misroute", async () => {
    const one = reactor("one");
    const two = reactor("two");
    one.seed(fakeDocument({ id: "doc-1" }));
    two.seed(fakeDocument({ id: "doc-1" }));
    // The write fails for its own reasons on the backend that does own it.
    one.failing.add("rename");
    const dispatcher = new RouteDispatcher([one.backend(), two.backend()], {
      onDiagnostic: silent,
    });

    const run = dispatcher.onDocument(
      "rename",
      "doc-1",
      (backend) => backend.client.rename("doc-1", "x"),
      ATTEMPT.write,
    );

    await expect(run).rejects.toThrow(/rename is configured to fail/);
    // A re-run elsewhere could have applied it twice; it must not happen.
    expect(two.called("rename")).toBe(false);
  });

  it("recovers a READ from a stale cache on positive evidence", async () => {
    const one = reactor("one");
    const two = reactor("two");
    two.seed(fakeDocument({ id: "doc-1", name: "on two" }));
    const dispatcher = new RouteDispatcher([one.backend(), two.backend()], {
      // Wrong: the document is on "two".
      documents: { "doc-1": "one" },
      onDiagnostic: silent,
    });

    const document = await dispatcher.onDocument(
      "get",
      "doc-1",
      (backend) => backend.client.get("doc-1"),
      ATTEMPT.read,
    );

    expect(document.header.name).toBe("on two");
    expect(dispatcher.table.documentBackend("doc-1")).toBe("two");
  });

  it("preserves a read's own error when no other backend serves the target", async () => {
    const one = reactor("one");
    const two = reactor("two");
    one.seed(fakeDocument({ id: "doc-1" }));
    one.failing.add("get");
    const dispatcher = new RouteDispatcher([one.backend(), two.backend()], {
      documents: { "doc-1": "one" },
      onDiagnostic: silent,
    });

    const run = dispatcher.onDocument(
      "get",
      "doc-1",
      (backend) => backend.client.get("doc-1"),
      ATTEMPT.read,
    );

    await expect(run).rejects.toThrow(/get is configured to fail/);
  });

  it("caches a resolved document so the next operation does not probe", async () => {
    const one = reactor("one");
    const two = reactor("two");
    two.seed(fakeDocument({ id: "doc-1" }));
    const dispatcher = new RouteDispatcher([one.backend(), two.backend()], {
      onDiagnostic: silent,
    });

    await dispatcher.resolveDocumentBackend("doc-1");
    const probesAfterFirst = one.calls.filter(
      (call) => call.method === "isServed",
    ).length;
    const resolved = await dispatcher.resolveDocumentBackend("doc-1");

    expect(resolved.name).toBe("two");
    expect(probesAfterFirst).toBe(1);
    expect(one.calls.filter((call) => call.method === "isServed")).toHaveLength(
      1,
    );
  });

  it("prefers the first backend in configuration order when a drive is replicated", async () => {
    const one = reactor("one");
    const two = reactor("two");
    // The shape sync produces: both reactors hold the same drive.
    one.seed(fakeDocument({ id: "drive-a" }));
    two.seed(fakeDocument({ id: "drive-a" }));
    const dispatcher = new RouteDispatcher([one.backend(), two.backend()], {
      onDiagnostic: silent,
    });

    const serving = await dispatcher.servingBackends("drive-a");

    expect(serving.map((backend) => backend.name)).toEqual(["one", "two"]);
    expect((await dispatcher.resolveDocumentBackend("drive-a")).name).toBe(
      "one",
    );
  });

  it("ignores an owner hint naming a backend it does not hold", async () => {
    const one = reactor("one");
    one.seed(fakeDocument({ id: "doc-1" }));
    const stranger: ReactorBackend = {
      name: "stranger",
      capabilities: one.capabilities,
      client: {
        isServed: () => Promise.resolve(false),
        isDocumentIdTaken: () => Promise.resolve(false),
        rename: () =>
          Promise.reject(
            new WrongBackendError({
              documentId: "doc-1",
              ownerHint: "a-reactor-this-router-never-heard-of",
              rejectedBy: "stranger",
            }),
          ),
      } as unknown as ReactorBackend["client"],
    };
    const reported: string[] = [];
    const dispatcher = new RouteDispatcher([stranger, one.backend()], {
      documents: { "doc-1": "stranger" },
      onDiagnostic: (message) => reported.push(message),
    });

    const renamed = await dispatcher.onDocument(
      "rename",
      "doc-1",
      (backend) => backend.client.rename("doc-1", "x"),
      ATTEMPT.write,
    );

    expect(renamed.header.name).toBe("x");
    expect(reported.join()).toMatch(/not a backend of this router/);
  });
});
