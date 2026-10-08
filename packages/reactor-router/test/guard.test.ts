import { DriveCollectionId } from "@powerhousedao/reactor";
import type { Action } from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import type { RouterBackend } from "../src/backend.js";
import { ATTEMPT, RouteDispatcher } from "../src/dispatcher.js";
import { FakeBackend, fakeDocument, silent } from "./stubs.js";

const setName = (name: string): Action[] =>
  [{ type: "SET_NAME", input: name, scope: "global" }] as unknown as Action[];

function renamer(identifier: string, name: string) {
  return (backend: RouterBackend) =>
    backend.api.execute(identifier, "main", setName(name));
}

describe("router-side ownership guard", () => {
  it("refuses a write for a backend that does not hold the target, before it is sent", async () => {
    const one = new FakeBackend("one");
    const two = new FakeBackend("two");
    one.seed(fakeDocument({ id: "drive-a" }));
    const dispatcher = new RouteDispatcher([one.handle(), two.handle()], {
      collections: { "drive-a": "two" },
      onDiagnostic: silent,
    });

    const renamed = await dispatcher.onCollection(
      "execute",
      "drive-a",
      "main",
      renamer("drive-a", "renamed"),
      ATTEMPT.write,
    );

    expect(renamed.header.name).toBe("renamed");
    expect(two.called("execute")).toBe(false);
    expect(one.count("execute")).toBe(1);
    expect(
      dispatcher.table.collectionRoute(DriveCollectionId.forDrive("drive-a")),
    ).toMatchObject({ backend: "one", source: "corrected" });
  });

  it("caches a positive answer, so the next write does not probe", async () => {
    const one = new FakeBackend("one");
    one.seed(fakeDocument({ id: "doc-1" }));
    const dispatcher = new RouteDispatcher([one.handle()], {
      documents: { "doc-1": "one" },
      onDiagnostic: silent,
    });
    const write = () =>
      dispatcher.onDocument(
        "execute",
        "doc-1",
        renamer("doc-1", "x"),
        ATTEMPT.write,
      );

    await write();
    const probes = one.count("isServed");
    await write();

    expect(probes).toBe(1);
    expect(one.count("isServed")).toBe(1);
    expect(one.count("execute")).toBe(2);
  });

  it("admits a taken id, so a soft-deleted document can still be written", async () => {
    const one = new FakeBackend("one");
    one.seed(fakeDocument({ id: "deleted-doc" }));
    const api = one.api();
    const handle = one.handle({
      backend: { ...api, isServed: () => Promise.resolve(false) },
    });
    const dispatcher = new RouteDispatcher([handle], {
      documents: { "deleted-doc": "one" },
      onDiagnostic: silent,
    });

    await dispatcher.onDocument(
      "deleteDocument",
      "deleted-doc",
      (backend) => backend.api.deleteDocument("deleted-doc"),
      ATTEMPT.write,
    );

    expect(one.called("deleteDocument")).toBe(true);
  });

  it("lets a write through when the probe cannot answer", async () => {
    const one = new FakeBackend("one");
    one.seed(fakeDocument({ id: "doc-1" }));
    one.failing.add("isServed");
    const reported: string[] = [];
    const dispatcher = new RouteDispatcher([one.handle()], {
      documents: { "doc-1": "one" },
      onDiagnostic: (message) => reported.push(message),
    });

    await dispatcher.onDocument(
      "execute",
      "doc-1",
      renamer("doc-1", "x"),
      ATTEMPT.write,
    );

    expect(one.count("execute")).toBe(1);
    expect(reported.join()).toMatch(/one could not say whether it holds/);
  });

  it("does not probe a backend that refuses misroutes itself", async () => {
    const one = new FakeBackend("one");
    one.refuses = true;
    one.seed(fakeDocument({ id: "doc-1" }));
    const dispatcher = new RouteDispatcher([one.handle()], {
      documents: { "doc-1": "one" },
      onDiagnostic: silent,
    });

    await dispatcher.onDocument(
      "execute",
      "doc-1",
      renamer("doc-1", "x"),
      ATTEMPT.write,
    );

    expect(one.called("isServed")).toBe(false);
  });

  it("does not guard reads", async () => {
    const one = new FakeBackend("one");
    one.seed(fakeDocument({ id: "doc-1" }));
    const dispatcher = new RouteDispatcher([one.handle()], {
      documents: { "doc-1": "one" },
      onDiagnostic: silent,
    });

    await dispatcher.onDocument(
      "get",
      "doc-1",
      (backend) => backend.api.get("doc-1"),
      ATTEMPT.read,
    );

    expect(one.called("isServed")).toBe(false);
  });
});
