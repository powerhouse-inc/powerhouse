import { DriveCollectionId } from "@powerhousedao/reactor";
import type { Action } from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import { RouterBackend, type IRoutableBackend } from "../src/backend.js";
import { ATTEMPT, RouteDispatcher } from "../src/dispatcher.js";
import {
  MisrouteUnresolvedError,
  NoEligibleBackendError,
  WrongBackendError,
} from "../src/errors.js";
import {
  FakeBackend,
  fakeDocument,
  IN_PROCESS,
  memoryInfo,
  silent,
  workflowInfo,
} from "./stubs.js";

function refusing(name: string): FakeBackend {
  const backend = new FakeBackend(name);
  backend.refuses = true;
  return backend;
}

const setName = (name: string): Action[] =>
  [{ type: "SET_NAME", input: name, scope: "global" }] as unknown as Action[];

function renamer(identifier: string, name: string) {
  return (backend: RouterBackend) =>
    backend.api.execute(identifier, "main", setName(name));
}

function stubBackend(
  name: string,
  api: Partial<IRoutableBackend>,
): RouterBackend {
  return new RouterBackend({
    name,
    backend: api as IRoutableBackend,
    facts: memoryInfo(),
    reach: IN_PROCESS,
    refusesMisroutes: true,
  });
}

describe("advisory routing", () => {
  it("lands a write on the owner even when the table names the wrong backend", async () => {
    const one = refusing("one");
    const two = refusing("two");
    one.seed(fakeDocument({ id: "drive-a", name: "A" }));
    const reported: string[] = [];
    const dispatcher = new RouteDispatcher([one.handle(), two.handle()], {
      collections: { "drive-a": "two" },
      onDiagnostic: (message) => reported.push(message),
    });

    const renamed = await dispatcher.onCollection(
      "execute",
      "drive-a",
      "main",
      renamer("drive-a", "renamed"),
      ATTEMPT.write,
    );

    expect(renamed.header.name).toBe("renamed");
    expect(one.count("execute")).toBe(1);
    expect(
      dispatcher.table.collectionRoute(DriveCollectionId.forDrive("drive-a")),
    ).toMatchObject({ backend: "one", source: "corrected" });
    expect(reported.join()).toMatch(
      /override for drive.main.drive-a names two/,
    );
  });

  it("does not repeat the refusal on the next operation", async () => {
    const one = refusing("one");
    const two = refusing("two");
    one.seed(fakeDocument({ id: "drive-a" }));
    const dispatcher = new RouteDispatcher([one.handle(), two.handle()], {
      collections: { "drive-a": "two" },
      onDiagnostic: silent,
    });
    const rename = (name: string): Promise<unknown> =>
      dispatcher.onCollection(
        "execute",
        "drive-a",
        "main",
        renamer("drive-a", name),
        ATTEMPT.write,
      );

    await rename("first");
    const refusalsAfterFirst = two.calls.length;
    await rename("second");

    expect(two.calls.length).toBe(refusalsAfterFirst);
    expect(one.count("execute")).toBe(2);
  });

  it("follows an owner hint without probing", async () => {
    const one = refusing("one");
    one.seed(fakeDocument({ id: "doc-1" }));
    const hinting = stubBackend("two", {
      isServed: () => Promise.resolve(false),
      execute: () =>
        Promise.reject(
          new WrongBackendError({
            documentId: "doc-1",
            ownerHint: "one",
            rejectedBy: "two",
          }),
        ),
    });
    const dispatcher = new RouteDispatcher([hinting, one.handle()], {
      documents: { "doc-1": "two" },
      onDiagnostic: silent,
    });

    const renamed = await dispatcher.onDocument(
      "execute",
      "doc-1",
      renamer("doc-1", "hinted"),
      ATTEMPT.write,
    );

    expect(renamed.header.name).toBe("hinted");
    expect(dispatcher.table.documentBackend("doc-1")).toBe("one");
  });

  it("refuses, rather than resolving, when every backend refuses", async () => {
    const one = refusing("one");
    const two = refusing("two");
    const dispatcher = new RouteDispatcher([one.handle(), two.handle()], {
      onDiagnostic: silent,
    });

    const run = dispatcher.onDocument(
      "execute",
      "nobody-has-this",
      renamer("nobody-has-this", "x"),
      ATTEMPT.write,
    );

    await expect(run).rejects.toThrow(MisrouteUnresolvedError);
    await expect(run).rejects.toThrow(/refused by every backend/);
  });

  it("never retries a WRITE that failed without a misroute", async () => {
    const one = refusing("one");
    const two = refusing("two");
    one.seed(fakeDocument({ id: "doc-1" }));
    two.seed(fakeDocument({ id: "doc-1" }));
    one.failing.add("execute");
    const dispatcher = new RouteDispatcher([one.handle(), two.handle()], {
      onDiagnostic: silent,
    });

    const run = dispatcher.onDocument(
      "execute",
      "doc-1",
      renamer("doc-1", "x"),
      ATTEMPT.write,
    );

    await expect(run).rejects.toThrow(/execute is configured to fail/);
    expect(two.called("execute")).toBe(false);
  });

  it("recovers a READ from a stale cache on positive evidence", async () => {
    const one = new FakeBackend("one");
    const two = new FakeBackend("two");
    two.seed(fakeDocument({ id: "doc-1", name: "on two" }));
    const dispatcher = new RouteDispatcher([one.handle(), two.handle()], {
      documents: { "doc-1": "one" },
      onDiagnostic: silent,
    });

    const document = await dispatcher.onDocument(
      "get",
      "doc-1",
      (backend) => backend.api.get("doc-1"),
      ATTEMPT.read,
    );

    expect(document.header.name).toBe("on two");
    expect(dispatcher.table.documentBackend("doc-1")).toBe("two");
  });

  it("preserves a read's own error when no other backend serves the target", async () => {
    const one = new FakeBackend("one");
    const two = new FakeBackend("two");
    one.seed(fakeDocument({ id: "doc-1" }));
    one.failing.add("get");
    const dispatcher = new RouteDispatcher([one.handle(), two.handle()], {
      documents: { "doc-1": "one" },
      onDiagnostic: silent,
    });

    const run = dispatcher.onDocument(
      "get",
      "doc-1",
      (backend) => backend.api.get("doc-1"),
      ATTEMPT.read,
    );

    await expect(run).rejects.toThrow(/get is configured to fail/);
  });

  it("caches a resolved document so the next operation does not probe", async () => {
    const one = new FakeBackend("one");
    const two = new FakeBackend("two");
    two.seed(fakeDocument({ id: "doc-1" }));
    const dispatcher = new RouteDispatcher([one.handle(), two.handle()], {
      onDiagnostic: silent,
    });

    await dispatcher.resolveDocumentBackend("doc-1");
    const resolved = await dispatcher.resolveDocumentBackend("doc-1");

    expect(resolved.name).toBe("two");
    expect(one.count("isServed")).toBe(1);
  });

  it("prefers the first backend in configuration order when a drive is replicated", async () => {
    const one = new FakeBackend("one");
    const two = new FakeBackend("two");
    one.seed(fakeDocument({ id: "drive-a" }));
    two.seed(fakeDocument({ id: "drive-a" }));
    const dispatcher = new RouteDispatcher([one.handle(), two.handle()], {
      onDiagnostic: silent,
    });

    const serving = await dispatcher.servingBackends("drive-a");

    expect(serving.map((backend) => backend.name)).toEqual(["one", "two"]);
    expect((await dispatcher.resolveDocumentBackend("drive-a")).name).toBe(
      "one",
    );
  });

  it("raises after exactly one attempt when a caller-pinned backend refuses", async () => {
    let calls = 0;
    const pinned = stubBackend("pinned", {
      execute: () => {
        calls++;
        return Promise.reject(
          new WrongBackendError({ documentId: "doc-1", rejectedBy: "pinned" }),
        );
      },
    });
    const dispatcher = new RouteDispatcher([pinned], { onDiagnostic: silent });

    const run = dispatcher.onBackend(
      "execute",
      pinned,
      renamer("doc-1", "x"),
      ATTEMPT.write,
    );

    await expect(run).rejects.toThrow(MisrouteUnresolvedError);
    expect(calls).toBe(1);
  });

  it("ignores an owner hint naming a backend it does not hold", async () => {
    const one = refusing("one");
    one.seed(fakeDocument({ id: "doc-1" }));
    const stranger = stubBackend("stranger", {
      isServed: () => Promise.resolve(false),
      execute: () =>
        Promise.reject(
          new WrongBackendError({
            documentId: "doc-1",
            ownerHint: "a-reactor-this-router-never-heard-of",
            rejectedBy: "stranger",
          }),
        ),
    });
    const reported: string[] = [];
    const dispatcher = new RouteDispatcher([stranger, one.handle()], {
      documents: { "doc-1": "stranger" },
      onDiagnostic: (message) => reported.push(message),
    });

    const renamed = await dispatcher.onDocument(
      "execute",
      "doc-1",
      renamer("doc-1", "x"),
      ATTEMPT.write,
    );

    expect(renamed.header.name).toBe("x");
    expect(reported.join()).toMatch(/not a backend of this router/);
  });
});

describe("ownership probe", () => {
  it("asks isDocumentIdTaken only when the backend declares it", async () => {
    const declared = new FakeBackend("declared");
    const undeclared = new FakeBackend("undeclared");
    undeclared.undeclared.add("isDocumentIdTaken");
    const dispatcher = new RouteDispatcher(
      [declared.handle(), undeclared.handle()],
      { onDiagnostic: silent },
    );

    expect(await dispatcher.servingBackends("doc-1")).toEqual([]);
    expect(declared.called("isDocumentIdTaken")).toBe(true);
    expect(undeclared.called("isDocumentIdTaken")).toBe(false);
  });

  it("counts a taken id as held, so a soft-deleted document still routes", async () => {
    const one = stubBackend("one", {
      isServed: () => Promise.resolve(false),
      isDocumentIdTaken: () => Promise.resolve(true),
    });
    const dispatcher = new RouteDispatcher([one], { onDiagnostic: silent });

    expect(await dispatcher.owns(one, "deleted-doc")).toBe("yes");
  });

  it("reports a failed probe and answers unknown instead of no", async () => {
    const reported: string[] = [];
    const one = stubBackend("one", {
      isServed: () => Promise.resolve(false),
      isDocumentIdTaken: () => Promise.reject(new Error("store offline")),
    });
    const dispatcher = new RouteDispatcher([one], {
      onDiagnostic: (message) => reported.push(message),
    });

    expect(await dispatcher.owns(one, "doc-1")).toBe("unknown");
    expect(reported.join()).toMatch(/one could not say.*store offline/);
  });
});

describe("placement facts", () => {
  it("re-reads facts once before refusing a placement", async () => {
    let reads = 0;
    const node = new FakeBackend("node").handle({
      facts: () => {
        reads++;
        return Promise.resolve(workflowInfo());
      },
    });
    const dispatcher = new RouteDispatcher([node], {
      defaultRequirements: { workflows: true },
      onDiagnostic: silent,
    });

    const backend = await dispatcher.resolveCollectionBackend(
      DriveCollectionId.forDrive("drive-a"),
    );

    expect(backend.name).toBe("node");
    expect(reads).toBe(1);
  });

  it("refuses when the re-read facts still meet nothing", async () => {
    const browser = new FakeBackend("browser").handle({
      facts: () => Promise.resolve(memoryInfo()),
    });
    const dispatcher = new RouteDispatcher([browser], {
      defaultRequirements: { workflows: true },
      onDiagnostic: silent,
    });

    await expect(
      dispatcher.resolveCollectionBackend(
        DriveCollectionId.forDrive("drive-a"),
      ),
    ).rejects.toThrow(NoEligibleBackendError);
  });
});

/** reactor-browser's GraphQLWrongBackendError (#3187), as the router sees it. */
function graphqlWrongBackend(driveId: string): Error {
  const error = new Error(
    `The Switchboard does not serve drive ${driveId}: 421 Misdirected Request`,
  );
  error.name = "GraphQLWrongBackendError";
  Object.assign(error, {
    status: 421,
    driveId,
    payload: { error: "wrong-shard", driveId },
  });
  return error;
}

describe("a Switchboard's wrong-shard refusal", () => {
  it("re-aims the write and corrects the table", async () => {
    const owner = refusing("owner");
    owner.seed(fakeDocument({ id: "drive-x" }));
    let refusals = 0;
    const remote = stubBackend("remote", {
      isServed: () => Promise.resolve(false),
      execute: () => {
        refusals++;
        return Promise.reject(graphqlWrongBackend("drive-x"));
      },
    });
    const dispatcher = new RouteDispatcher([remote, owner.handle()], {
      collections: { "drive-x": "remote" },
      onDiagnostic: silent,
    });

    const renamed = await dispatcher.onCollection(
      "execute",
      "drive-x",
      "main",
      renamer("drive-x", "re-aimed"),
      ATTEMPT.write,
    );

    expect(refusals).toBe(1);
    expect(renamed.header.name).toBe("re-aimed");
    expect(owner.count("execute")).toBe(1);
    expect(
      dispatcher.table.collectionRoute(DriveCollectionId.forDrive("drive-x")),
    ).toMatchObject({ backend: "owner", source: "corrected" });
  });
});
