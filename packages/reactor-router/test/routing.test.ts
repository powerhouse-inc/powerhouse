import { DriveCollectionId } from "@powerhousedao/reactor";
import { describe, expect, it } from "vitest";
import {
  CrossBackendBatchError,
  CrossBackendRelationshipError,
  FanInPartialFailureError,
  NoEligibleBackendError,
  RoutingReactorClient,
  type ReactorBackend,
} from "../src/index.js";
import {
  FakeReactor,
  fakeDocument,
  inProcessCapabilities,
  workflowCapabilities,
} from "./stubs.js";

const silent = (): void => {};

type Topology = {
  readonly one: FakeReactor;
  readonly two: FakeReactor;
  readonly backends: ReactorBackend[];
};

/** Two reactors, each holding one drive, with their ownership guards on. */
function topology(): Topology {
  const one = new FakeReactor("one", inProcessCapabilities("one"));
  const two = new FakeReactor("two", inProcessCapabilities("two"));
  one.seed(
    fakeDocument({
      id: "drive-a",
      documentType: "powerhouse/document-drive",
      name: "A",
    }),
  );
  two.seed(
    fakeDocument({
      id: "drive-b",
      documentType: "powerhouse/document-drive",
      name: "B",
    }),
  );
  return { one, two, backends: [one.backend(), two.backend()] };
}

function router(
  backends: ReactorBackend[],
  options: Record<string, unknown> = {},
): RoutingReactorClient {
  return new RoutingReactorClient(backends, {
    onDiagnostic: silent,
    ...options,
  });
}

describe("routing by collection", () => {
  it("sends a drive operation to the reactor that holds the drive", async () => {
    const { one, two, backends } = topology();
    const client = router(backends, {
      collections: { "drive-a": "one", "drive-b": "two" },
    });

    await client.drives.addFolder("drive-a", "from-a");
    await client.drives.addFolder("drive-b", "from-b");

    expect(
      one.calls.filter((call) => call.method === "drives.addFolder"),
    ).toEqual([{ method: "drives.addFolder", args: ["drive-a", "from-a"] }]);
    expect(
      two.calls.filter((call) => call.method === "drives.addFolder"),
    ).toEqual([{ method: "drives.addFolder", args: ["drive-b", "from-b"] }]);
  });

  it("learns the owner with no overrides at all, from one probe", async () => {
    const { one, two, backends } = topology();
    const client = router(backends);

    await client.drives.addFolder("drive-b", "learned");

    expect(two.called("drives.addFolder")).toBe(true);
    expect(one.called("drives.addFolder")).toBe(false);
    expect(
      client
        .describeRouting()
        .collections.find(
          (entry) =>
            entry.collectionId === DriveCollectionId.forDrive("drive-b").key,
        ),
    ).toMatchObject({ backend: "two" });
  });

  it("routes a document operation to its owner and caches the resolution", async () => {
    const { one, two, backends } = topology();
    one.seed(fakeDocument({ id: "doc-on-one", slug: "doc-slug" }));
    const client = router(backends);

    const first = await client.get("doc-on-one");
    const probesAfterFirst = two.calls.filter(
      (call) => call.method === "isServed",
    ).length;
    await client.get("doc-on-one");

    expect(first.header.id).toBe("doc-on-one");
    expect(two.calls.filter((call) => call.method === "isServed")).toHaveLength(
      probesAfterFirst,
    );
    expect(client.describeRouting().documents).toEqual(
      expect.arrayContaining([{ identifier: "doc-on-one", backend: "one" }]),
    );
  });

  it("places a new drive by the hash and remembers where it put it", async () => {
    const { backends } = topology();
    const client = router(backends);

    const drive = await client.drives.create({
      id: "drive-new",
      global: { name: "new" },
    });

    const placed = client
      .describeRouting()
      .collections.find(
        (entry) =>
          entry.collectionId === DriveCollectionId.forDrive("drive-new").key,
      );
    expect(placed?.backend).toBeTruthy();
    expect(drive.header.id).toBe("drive-new");
    expect(
      client
        .describeRouting()
        .documents.some((entry) => entry.identifier === "drive-new"),
    ).toBe(true);
  });

  it("creates a child on the parent's reactor", async () => {
    const { one, two, backends } = topology();
    const client = router(backends);

    await client.create(fakeDocument({ id: "child-doc" }), "drive-b");

    expect(two.called("create")).toBe(true);
    expect(one.called("create")).toBe(false);
  });
});

describe("capability-aware placement through the client", () => {
  it("keeps a workflow collection off a reactor that cannot run workflows", async () => {
    const browser = new FakeReactor(
      "browser",
      inProcessCapabilities("browser"),
    );
    const node = new FakeReactor("node", workflowCapabilities("node"));
    browser.seed(fakeDocument({ id: "plain-drive" }));
    const client = router([browser.backend(), node.backend()], {
      requirements: { "workflow-drive": { workflows: true } },
    });

    await client.drives.create({
      id: "workflow-drive",
      global: { name: "workflows" },
    });

    expect(node.called("drives.create")).toBe(true);
    expect(browser.called("drives.create")).toBe(false);
  });

  it("refuses to place a collection nothing can hold, naming the reason", async () => {
    const browser = new FakeReactor(
      "browser",
      inProcessCapabilities("browser"),
    );
    const client = router([browser.backend()], {
      defaultRequirements: { workflows: true },
    });

    const run = client.drives.create({
      id: "workflow-drive",
      global: { name: "workflows" },
    });

    await expect(run).rejects.toThrow(NoEligibleBackendError);
    await expect(run).rejects.toThrow(/capabilities.workflows is false/);
  });
});

describe("fan-in reads through the client", () => {
  it("merges find across backends in backend order", async () => {
    const { one, two, backends } = topology();
    one.seed(fakeDocument({ id: "note-1", documentType: "test/note" }));
    two.seed(fakeDocument({ id: "note-2", documentType: "test/note" }));
    const client = router(backends);

    const page = await client.find({ type: "test/note" });

    expect(page.results.map((document) => document.header.id)).toEqual([
      "note-1",
      "note-2",
    ]);
  });

  it("refuses a find whose result would be silently incomplete", async () => {
    const { two, backends } = topology();
    two.failing.add("find");
    const client = router(backends);

    await expect(client.find({ type: "test/note" })).rejects.toThrow(
      FanInPartialFailureError,
    );
  });

  it("excludes a capability-limited backend from find instead of crashing the whole read (the Connect boot scenario)", async () => {
    // Exactly the live defect: a local reactor that serves find alongside a
    // remote Switchboard backend whose GraphQL client cannot. Connect's boot
    // getDrives -> find used to turn the remote's by-contract throw into a
    // FanInPartialFailureError that bricked the app at mount.
    const local = new FakeReactor(
      "connect-local",
      inProcessCapabilities("connect-local"),
    );
    local.seed(fakeDocument({ id: "local-drive", documentType: "test/note" }));
    const remote = new FakeReactor(
      "switchboard-remote",
      inProcessCapabilities("switchboard-remote"),
    );
    remote.unsupported.add("find");
    const reported: string[] = [];
    const client = new RoutingReactorClient(
      [local.backend(), remote.backend()],
      {
        primaryBackend: "connect-local",
        onDiagnostic: (message) => reported.push(message),
      },
    );

    const page = await client.find({ type: "test/note" });

    expect(page.results.map((document) => document.header.id)).toEqual([
      "local-drive",
    ]);
    expect(reported.join()).toMatch(
      /find: backend switchboard-remote is not applicable to this read and was excluded/,
    );
  });

  it("merges relationship edges and tolerates the backends without the source", async () => {
    const { one, two, backends } = topology();
    one.seed(fakeDocument({ id: "source-doc" }));
    one.relationships.push({
      sourceId: "source-doc",
      targetId: "target-on-one",
      relationshipType: "child",
    });
    const client = router(backends);

    const edges = await client.getOutgoingRelationshipEdges("source-doc");

    expect(edges.results.map((edge) => edge.targetId)).toEqual([
      "target-on-one",
    ]);
    // "two" was asked and legitimately could not answer; the read still works.
    expect(two.called("getOutgoingRelationshipEdges")).toBe(true);
  });

  it("answers isServed and isDocumentIdTaken from any backend", async () => {
    const { backends } = topology();
    const client = router(backends);

    await expect(client.isServed("drive-b")).resolves.toBe(true);
    await expect(client.isDocumentIdTaken("drive-a")).resolves.toBe(true);
    await expect(client.isServed("nowhere")).resolves.toBe(false);
  });

  it("de-duplicates a replicated document's change events", () => {
    const { one, two, backends } = topology();
    const replicated = fakeDocument({ id: "synced-doc" });
    one.seed(replicated);
    two.seed(replicated);
    const client = router(backends);
    const seen: string[] = [];

    const unsubscribe = client.subscribe({}, (event) => {
      seen.push(event.type);
    });
    const change = {
      type: "updated",
      documents: [replicated],
    } as unknown as Parameters<typeof one.emit>[0];
    one.emit(change);
    two.emit(change);
    unsubscribe();

    expect(seen).toEqual(["updated"]);
    expect(one.subscribers).toHaveLength(0);
    expect(two.subscribers).toHaveLength(0);
  });

  it("delivers two genuinely different changes to the same document", () => {
    const { one, backends } = topology();
    const document = fakeDocument({ id: "edited-doc" });
    one.seed(document);
    const client = router(backends);
    const seen: string[] = [];

    const unsubscribe = client.subscribe({}, (event) => {
      seen.push(String(event.documents[0].header.revision.global));
    });
    one.emit({ type: "updated", documents: [document] } as never);
    one.emit({
      type: "updated",
      documents: [
        {
          ...document,
          header: { ...document.header, revision: { global: 1 } },
        },
      ],
    } as never);
    unsubscribe();

    expect(seen).toEqual(["0", "1"]);
  });
});

describe("v1 constraints", () => {
  it("refuses a batch that spans reactors, having submitted nothing", async () => {
    const { one, two, backends } = topology();
    one.seed(fakeDocument({ id: "doc-on-one" }));
    two.seed(fakeDocument({ id: "doc-on-two" }));
    const client = router(backends);

    const run = client.executeBatch({
      jobs: [
        {
          key: "a",
          documentId: "doc-on-one",
          scope: "global",
          branch: "main",
          actions: [],
          dependsOn: [],
        },
        {
          key: "b",
          documentId: "doc-on-two",
          scope: "global",
          branch: "main",
          actions: [],
          dependsOn: [],
        },
      ],
    });

    await expect(run).rejects.toThrow(CrossBackendBatchError);
    await expect(run).rejects.toThrow(/doc-on-one@one/);
    expect(one.called("executeBatch")).toBe(false);
    expect(two.called("executeBatch")).toBe(false);
  });

  it("runs a batch whose documents share a reactor", async () => {
    const { one, backends } = topology();
    one.seed(fakeDocument({ id: "doc-1" }));
    one.seed(fakeDocument({ id: "doc-2" }));
    const client = router(backends);

    const result = await client.executeBatch({
      jobs: [
        {
          key: "a",
          documentId: "doc-1",
          scope: "global",
          branch: "main",
          actions: [],
          dependsOn: [],
        },
        {
          key: "b",
          documentId: "doc-2",
          scope: "global",
          branch: "main",
          actions: [],
          dependsOn: [],
        },
      ],
    });

    expect(Object.keys(result.jobs)).toEqual(["a", "b"]);
    // Every job's backend is remembered, so a later waitForJob needs no probe.
    expect(client.describeRouting().jobs).toHaveLength(2);
  });

  it("refuses a cross-reactor loadBatch and deleteDocuments the same way", async () => {
    const { one, two, backends } = topology();
    one.seed(fakeDocument({ id: "doc-on-one" }));
    two.seed(fakeDocument({ id: "doc-on-two" }));
    const client = router(backends);

    await expect(
      client.loadBatch({
        jobs: [
          {
            key: "a",
            documentId: "doc-on-one",
            scope: "global",
            branch: "main",
            operations: [],
            dependsOn: [],
            externalDeps: [],
          },
          {
            key: "b",
            documentId: "doc-on-two",
            scope: "global",
            branch: "main",
            operations: [],
            dependsOn: [],
            externalDeps: [],
          },
        ],
      }),
    ).rejects.toThrow(CrossBackendBatchError);
    await expect(
      client.deleteDocuments(["doc-on-one", "doc-on-two"]),
    ).rejects.toThrow(CrossBackendBatchError);
    expect(one.called("deleteDocuments")).toBe(false);
  });

  it("refuses a relationship WRITE across reactors, having written nothing", async () => {
    const { one, two, backends } = topology();
    one.seed(fakeDocument({ id: "source-doc" }));
    two.seed(fakeDocument({ id: "target-doc" }));
    const client = router(backends);

    const run = client.addRelationship("source-doc", "target-doc", "child");

    await expect(run).rejects.toThrow(CrossBackendRelationshipError);
    await expect(run).rejects.toThrow(/read-level only/);
    expect(one.called("addRelationship")).toBe(false);
  });

  it("allows a relationship write within one reactor", async () => {
    const { one, backends } = topology();
    one.seed(fakeDocument({ id: "source-doc" }));
    one.seed(fakeDocument({ id: "target-doc" }));
    const client = router(backends);

    await client.addRelationship("source-doc", "target-doc", "child");

    expect(one.relationships).toEqual([
      {
        sourceId: "source-doc",
        targetId: "target-doc",
        relationshipType: "child",
      },
    ]);
  });
});

describe("jobs", () => {
  it("asks the backend that minted the job id", async () => {
    const { one, two, backends } = topology();
    two.seed(fakeDocument({ id: "doc-on-two" }));
    const client = router(backends);

    const job = await client.executeAsync("doc-on-two", "main", []);
    const status = await client.getJobStatus(job.id);

    expect(status.id).toBe(job.id);
    expect(one.called("getJobStatus")).toBe(false);
  });

  it("falls back to asking every backend for an id it never saw", async () => {
    const { two, backends } = topology();
    two.seed(fakeDocument({ id: "doc-on-two" }));
    const client = router(backends);
    const job = await client.executeAsync("doc-on-two", "main", []);
    const fresh = router(backends);

    const status = await fresh.getJobStatus(job.id);

    expect(status.id).toBe(job.id);
    expect(status.documentId).toBe("doc-on-two");
    expect(fresh.describeRouting().jobs).toEqual([
      { jobId: job.id, backend: "two" },
    ]);
  });
});
