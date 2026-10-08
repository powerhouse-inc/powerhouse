import {
  bucketFor,
  DriveCollectionId,
  JobStatus,
  type JobInfo,
} from "@powerhousedao/reactor";
import type {
  Action,
  DocumentModelModule,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import {
  createRoutingClient,
  CrossBackendBatchError,
  CrossBackendRelationshipError,
  FanInPartialFailureError,
  NoEligibleBackendError,
  RoutingReactorClient,
  UnsupportedByBackendError,
  type RoutableBackendConfig,
  type RoutingClientOptions,
} from "../src/index.js";
import {
  FakeBackend,
  fakeDocument,
  fakeJob,
  memoryInfo,
  REMOTE,
  silent,
  workflowInfo,
} from "./stubs.js";

type Topology = {
  readonly one: FakeBackend;
  readonly two: FakeBackend;
  readonly backends: RoutableBackendConfig[];
};

function topology(): Topology {
  const one = new FakeBackend("one");
  const two = new FakeBackend("two");
  one.seed(
    fakeDocument({ id: "drive-a", documentType: "powerhouse/document-drive" }),
  );
  two.seed(
    fakeDocument({ id: "drive-b", documentType: "powerhouse/document-drive" }),
  );
  return { one, two, backends: [one.config(), two.config()] };
}

function router(
  backends: RoutableBackendConfig[],
  options: RoutingClientOptions = {},
): RoutingReactorClient {
  return new RoutingReactorClient(backends, {
    onDiagnostic: silent,
    ...options,
  });
}

function job(key: string, documentId: string) {
  return {
    key,
    documentId,
    scope: "global",
    branch: "main",
    actions: [],
    dependsOn: [],
  };
}

describe("routing documents", () => {
  it("routes a document read to its owner and caches the resolution", async () => {
    const { one, two, backends } = topology();
    one.seed(fakeDocument({ id: "doc-on-one" }));
    const client = router(backends);

    const first = await client.get("doc-on-one");
    const probes = two.count("isServed");
    await client.get("doc-on-one");

    expect(first.header.id).toBe("doc-on-one");
    expect(two.count("isServed")).toBe(probes);
    expect(client.describeRouting().documents).toEqual(
      expect.arrayContaining([{ identifier: "doc-on-one", backend: "one" }]),
    );
  });

  it("creates a child on the parent's backend", async () => {
    const { one, two, backends } = topology();
    const client = router(backends);

    await client.create(fakeDocument({ id: "child-doc" }), "drive-b");

    expect(two.called("create")).toBe(true);
    expect(one.called("create")).toBe(false);
  });

  it("renames by executing SET_NAME on the document's backend", async () => {
    const { two, backends } = topology();
    two.seed(fakeDocument({ id: "doc-on-two" }));
    const client = router(backends);

    const renamed = await client.rename("doc-on-two", "renamed");

    expect(renamed.header.name).toBe("renamed");
    const call = two.calls.find((entry) => entry.method === "execute");
    expect((call?.args[1] as Action[] | undefined)?.[0].type).toBe("SET_NAME");
  });

  it("submits createAsync as signed create jobs on the parent's backend", async () => {
    const { two, backends } = topology();
    const client = router(backends);

    const result = await client.createAsync(
      fakeDocument({ id: "new-doc" }),
      "drive-b",
    );

    expect(Object.keys(result.jobs).sort()).toEqual(["create", "parent"]);
    const request = two.calls.find((entry) => entry.method === "executeBatch")
      ?.args[0] as { jobs: { documentId: string }[] };
    expect(request.jobs.map((entry) => entry.documentId)).toEqual([
      "new-doc",
      "drive-b",
    ]);
    expect(client.describeRouting().jobs).toHaveLength(2);
  });

  it("submits executeAsync as a one-job batch and records the job", async () => {
    const { two, backends } = topology();
    two.seed(fakeDocument({ id: "doc-on-two" }));
    const client = router(backends);

    const submitted = await client.executeAsync("doc-on-two", "main", [
      { type: "SET_NAME", input: "x", scope: "global" } as unknown as Action,
    ]);

    expect(submitted.documentId).toBe("doc-on-two");
    expect(client.describeRouting().jobs).toEqual([
      { jobId: submitted.id, backend: "two" },
    ]);
  });

  it("deletes every document of a multi-delete on their one backend", async () => {
    const { one, backends } = topology();
    one.seed(fakeDocument({ id: "doc-1" }));
    one.seed(fakeDocument({ id: "doc-2" }));
    const client = router(backends);

    await client.deleteDocuments(["doc-1", "doc-2"]);

    expect(one.count("deleteDocument")).toBe(2);
  });

  it("resolves an identifier through get when the backend declares no resolver", async () => {
    const one = new FakeBackend("one");
    one.undeclared.add("resolveIdOrSlug");
    one.seed(fakeDocument({ id: "doc-1", slug: "the-slug" }));
    const client = router([one.config()]);

    await expect(client.resolveIdOrSlug("the-slug")).resolves.toBe("doc-1");
  });
});

describe("placement through the client", () => {
  it("keeps a workflow collection off a backend that cannot run workflows", async () => {
    const browser = new FakeBackend("browser");
    const node = new FakeBackend("node", workflowInfo(), REMOTE);
    const client = router([browser.config(), node.config()], {
      requirements: { "workflow-drive": { workflows: true } },
    });

    await client.drives.create({ id: "workflow-drive", global: { name: "w" } });

    expect(node.called("create")).toBe(true);
    expect(browser.called("create")).toBe(false);
  });

  it("refuses to place a collection nothing can hold, naming the reason", async () => {
    const browser = new FakeBackend("browser");
    const client = router([browser.config()], {
      defaultRequirements: { workflows: true },
    });

    const run = client.drives.create({ id: "w", global: { name: "w" } });

    await expect(run).rejects.toThrow(NoEligibleBackendError);
    await expect(run).rejects.toThrow(/workflows is false/);
  });

  const parentless = Array.from({ length: 8 }, (_v, i) => `parentless-${i}`);
  const hashedTo = (id: string, count: number): number =>
    bucketFor(DriveCollectionId.forDrive(id).key, count);

  it("places a parentless create by the id's collection requirements", async () => {
    expect(parentless.some((id) => hashedTo(id, 2) === 0)).toBe(true);
    const plain = new FakeBackend("plain");
    const node = new FakeBackend("node", workflowInfo(), REMOTE);
    const client = router([plain.config(), node.config()], {
      requirements: Object.fromEntries(
        parentless.map((id) => [id, { workflows: true }]),
      ),
    });

    for (const id of parentless.slice(0, 4)) {
      await client.create(fakeDocument({ id }));
    }
    for (const id of parentless.slice(4)) {
      await client.createAsync(fakeDocument({ id }));
    }

    expect(plain.count("create") + plain.count("executeBatch")).toBe(0);
    expect(node.count("create")).toBe(4);
    expect(node.count("executeBatch")).toBe(4);
  });

  it("places a parentless create on the id's collections override", async () => {
    expect(parentless.some((id) => hashedTo(id, 2) === 0)).toBe(true);
    const one = new FakeBackend("one");
    const two = new FakeBackend("two");
    const client = router([one.config(), two.config()], {
      collections: Object.fromEntries(parentless.map((id) => [id, "two"])),
    });

    for (const id of parentless.slice(0, 4)) {
      await client.create(fakeDocument({ id }));
    }
    for (const id of parentless.slice(4)) {
      await client.createAsync(fakeDocument({ id }));
    }

    expect(one.count("create") + one.count("executeBatch")).toBe(0);
    expect(two.count("create")).toBe(4);
    expect(two.count("executeBatch")).toBe(4);
  });

  it("reads lazy facts before it is handed out", async () => {
    const node = new FakeBackend("node");
    const client = await createRoutingClient(
      [node.config({ facts: () => Promise.resolve(workflowInfo()) })],
      { onDiagnostic: silent },
    );

    expect(client.backends[0].facts).toMatchObject({
      reactor: workflowInfo(),
      known: true,
    });
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

  it("leaves out a backend whose find support declines the search, and says so", async () => {
    const local = new FakeBackend("connect-local");
    local.seed(fakeDocument({ id: "local-drive", documentType: "test/note" }));
    const remote = new FakeBackend(
      "switchboard-remote",
      workflowInfo(),
      REMOTE,
    );
    remote.supports = { find: () => false, pointInTimeViews: false };
    const reported: string[] = [];
    const client = router([local.config(), remote.config()], {
      onDiagnostic: (message) => reported.push(message),
    });

    const page = await client.find({ type: "test/note" });

    expect(page.results.map((document) => document.header.id)).toEqual([
      "local-drive",
    ]);
    expect(remote.called("find")).toBe(false);
    expect(reported.join()).toMatch(
      /find: backend switchboard-remote was excluded/,
    );
  });

  it("refuses a find no backend supports, as a rejection", async () => {
    const one = new FakeBackend("one");
    one.supports = { find: () => false, pointInTimeViews: true };
    const client = router([one.config()]);

    await expect(client.find({ type: "test/note" })).rejects.toThrow(
      UnsupportedByBackendError,
    );
  });

  it("routes a relationship read to the backend that owns the source", async () => {
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
    expect(two.called("getOutgoingRelationshipEdges")).toBe(false);
  });

  it("answers isServed from any backend and refuses a false it cannot vouch for", async () => {
    const { one, backends } = topology();
    const client = router(backends);

    await expect(client.isServed("drive-b")).resolves.toBe(true);
    await expect(client.isServed("nowhere")).resolves.toBe(false);

    one.failing.add("isServed");
    await expect(
      router([one.config(), backends[1]]).isServed("nowhere"),
    ).rejects.toThrow(FanInPartialFailureError);
  });

  it("answers isDocumentIdTaken where the id is held, else from the primary", async () => {
    const { backends } = topology();
    const client = router(backends);

    await expect(client.isDocumentIdTaken("drive-b")).resolves.toBe(true);
    await expect(client.isDocumentIdTaken("brand-new")).resolves.toBe(false);
  });

  it("de-duplicates a replicated document's change events", () => {
    const { one, two, backends } = topology();
    const replicated = fakeDocument({ id: "synced-doc" });
    const client = router(backends);
    const seen: string[] = [];

    const unsubscribe = client.subscribe({}, (event) => {
      seen.push(event.type);
    });
    const change = { type: "updated", documents: [replicated] } as never;
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

describe("declared support", () => {
  it("refuses a point-in-time read on a backend that does not serve them, before sending it", async () => {
    const one = new FakeBackend("one");
    one.supports = { find: () => true, pointInTimeViews: false };
    one.seed(fakeDocument({ id: "doc-1" }));
    const client = router([one.config()], { documents: { "doc-1": "one" } });

    await expect(client.get("doc-1", { revision: 3 })).rejects.toThrow(
      UnsupportedByBackendError,
    );
    expect(one.called("get")).toBe(false);
  });

  it("refuses an undeclared loadBatch, relationship write and evaluateActions", async () => {
    const one = new FakeBackend("one");
    for (const member of [
      "loadBatch",
      "addRelationship",
      "evaluateActions",
    ] as const) {
      one.undeclared.add(member);
    }
    one.seed(fakeDocument({ id: "doc-1" }));
    one.seed(fakeDocument({ id: "doc-2" }));
    const client = router([one.config()]);

    await expect(client.loadBatch({ jobs: [] })).rejects.toThrow(
      UnsupportedByBackendError,
    );
    await expect(
      client.addRelationship("doc-1", "doc-2", "child"),
    ).rejects.toThrow(UnsupportedByBackendError);
    await expect(client.evaluateActions("doc-1", "main", [])).rejects.toThrow(
      UnsupportedByBackendError,
    );
    expect(one.called("addRelationship")).toBe(false);
  });
});

describe("v1 constraints", () => {
  it("refuses a batch that spans backends, having submitted nothing", async () => {
    const { one, two, backends } = topology();
    one.seed(fakeDocument({ id: "doc-on-one" }));
    two.seed(fakeDocument({ id: "doc-on-two" }));
    const client = router(backends);

    const run = client.executeBatch({
      jobs: [job("a", "doc-on-one"), job("b", "doc-on-two")],
    });

    await expect(run).rejects.toThrow(CrossBackendBatchError);
    await expect(run).rejects.toThrow(/doc-on-one@one/);
    expect(one.called("executeBatch")).toBe(false);
    expect(two.called("executeBatch")).toBe(false);
  });

  it("runs a batch whose documents share a backend", async () => {
    const { one, backends } = topology();
    one.seed(fakeDocument({ id: "doc-1" }));
    one.seed(fakeDocument({ id: "doc-2" }));
    const client = router(backends);

    const result = await client.executeBatch({
      jobs: [job("a", "doc-1"), job("b", "doc-2")],
    });

    expect(Object.keys(result.jobs)).toEqual(["a", "b"]);
    expect(client.describeRouting().jobs).toHaveLength(2);
  });

  it("refuses a cross-backend deleteDocuments the same way", async () => {
    const { one, two, backends } = topology();
    one.seed(fakeDocument({ id: "doc-on-one" }));
    two.seed(fakeDocument({ id: "doc-on-two" }));
    const client = router(backends);

    await expect(
      client.deleteDocuments(["doc-on-one", "doc-on-two"]),
    ).rejects.toThrow(CrossBackendBatchError);
    expect(one.called("deleteDocument")).toBe(false);
  });

  it("refuses a relationship write across backends, having written nothing", async () => {
    const { one, two, backends } = topology();
    one.seed(fakeDocument({ id: "source-doc" }));
    two.seed(fakeDocument({ id: "target-doc" }));
    const client = router(backends);

    await expect(
      client.addRelationship("source-doc", "target-doc", "child"),
    ).rejects.toThrow(CrossBackendRelationshipError);
    expect(one.called("addRelationship")).toBe(false);
  });

  it("allows a relationship write within one backend", async () => {
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

describe("a stale document entry under a batch-shaped write", () => {
  function stale(refuses: boolean) {
    const one = new FakeBackend("one");
    const two = new FakeBackend("two");
    one.refuses = refuses;
    two.refuses = refuses;
    one.seed(fakeDocument({ id: "doc-1" }));
    one.seed(
      fakeDocument({
        id: "drive-a",
        documentType: "powerhouse/document-drive",
      }),
    );
    const client = router([one.config(), two.config()], {
      documents: { "doc-1": "two", "drive-a": "two" },
    });
    const owner = (identifier: string) =>
      client
        .describeRouting()
        .documents.find((entry) => entry.identifier === identifier)?.backend;
    return { one, two, client, owner };
  }

  it("deleteDocuments forgets the stale entry and deletes on the owner, every time", async () => {
    const { one, client, owner } = stale(true);

    await client.deleteDocuments(["doc-1"]);
    await client.deleteDocuments(["doc-1"]);

    expect(one.count("deleteDocument")).toBe(2);
    expect(owner("doc-1")).toBe("one");
  });

  it("executeBatch re-resolves once after a refusal", async () => {
    const { one, two, client, owner } = stale(true);

    const result = await client.executeBatch({ jobs: [job("a", "doc-1")] });

    expect(Object.keys(result.jobs)).toEqual(["a"]);
    expect(two.count("executeBatch")).toBe(1);
    expect(one.count("executeBatch")).toBe(1);
    expect(owner("doc-1")).toBe("one");
  });

  it("executeBatch is guarded on a backend that does not refuse", async () => {
    const { one, two, client, owner } = stale(false);

    await client.executeBatch({ jobs: [job("a", "doc-1")] });

    expect(two.called("executeBatch")).toBe(false);
    expect(one.count("executeBatch")).toBe(1);
    expect(owner("doc-1")).toBe("one");
  });

  it("loadBatch is guarded on a backend that does not refuse", async () => {
    const { one, two, client } = stale(false);

    await client.loadBatch({
      jobs: [
        {
          key: "a",
          documentId: "doc-1",
          scope: "global",
          branch: "main",
          operations: [],
          dependsOn: [],
          externalDeps: [],
        },
      ],
    });

    expect(two.called("loadBatch")).toBe(false);
    expect(one.count("loadBatch")).toBe(1);
  });

  it("create with a parent lands on the parent's real backend", async () => {
    const { one, two, client, owner } = stale(false);

    await client.create(fakeDocument({ id: "child" }), "drive-a");

    expect(two.called("create")).toBe(false);
    expect(one.count("create")).toBe(1);
    expect(owner("drive-a")).toBe("one");
  });

  it("createAsync re-resolves once when the parent is not found before submitting", async () => {
    const { one, two, client, owner } = stale(true);

    await client.createAsync(fakeDocument({ id: "child" }), "drive-a");

    expect(two.called("executeBatch")).toBe(false);
    expect(one.count("executeBatch")).toBe(1);
    expect(owner("drive-a")).toBe("one");
  });

  it("keeps a not-found when no backend holds the parent", async () => {
    const { one, two, client } = stale(true);

    const run = client.createAsync(fakeDocument({ id: "child" }), "nowhere");

    await expect(run).rejects.toMatchObject({ name: "DocumentNotFoundError" });
    expect(one.called("executeBatch") || two.called("executeBatch")).toBe(
      false,
    );
  });
});

describe("registry", () => {
  const module = (id: string, version: number) =>
    ({
      documentModel: { global: { id } },
      version,
    }) as unknown as DocumentModelModule;

  it("answers from the configured modules without asking a backend", async () => {
    const { one, backends } = topology();
    const client = router(backends, {
      documentModelModules: [module("test/doc", 1), module("test/doc", 2)],
    });

    const latest = await client.getDocumentModelModule("test/doc");

    expect(latest.version).toBe(2);
    expect(one.called("getDocumentModelModule")).toBe(false);
  });

  it("falls back to the primary's registry", async () => {
    const { one, backends } = topology();
    const client = router(backends);

    await expect(client.getDocumentModelModule("test/doc")).rejects.toThrow(
      /no module test\/doc/,
    );
    expect(one.called("getDocumentModelModule")).toBe(true);
  });
});

describe("upgradeDocument", () => {
  it("retries a conflicted upgrade from a fresh read", async () => {
    const one = new FakeBackend("one");
    const document = fakeDocument({ id: "doc-1", documentType: "test/doc" });
    (document as { state: unknown }).state = { document: { version: 1 } };
    one.seed(document);
    const api = one.api();
    let submissions = 0;
    const conflicted: JobInfo = {
      ...fakeJob("conflict", "doc-1"),
      status: JobStatus.FAILED,
      error: {
        name: "UpgradePreconditionFailedError",
        message: "revision moved",
        stack: "",
      },
    };
    const client = router(
      [
        one.config({
          backend: {
            ...api,
            executeBatch: (request, signal) => {
              submissions++;
              if (submissions === 1) {
                const error = new Error("revision moved");
                error.name = "BatchJobFailedError";
                Object.assign(error, { key: "job", jobs: { job: conflicted } });
                return Promise.reject(error);
              }
              return api.executeBatch(request, signal);
            },
          },
        }),
      ],
      {
        documentModelModules: [
          {
            documentModel: { global: { id: "test/doc" } },
            version: 2,
          } as unknown as DocumentModelModule,
        ],
      },
    );

    const upgraded = await client.upgradeDocument<PHDocument>("doc-1");

    expect(submissions).toBe(2);
    expect(upgraded.header.id).toBe("doc-1");
  });
});

describe("jobs", () => {
  it("asks the backend that took the job", async () => {
    const { one, two, backends } = topology();
    two.seed(fakeDocument({ id: "doc-on-two" }));
    const client = router(backends);

    const submitted = await client.executeAsync("doc-on-two", "main", []);
    const status = await client.getJobStatus(submitted.id);

    expect(status.id).toBe(submitted.id);
    expect(one.called("getJob")).toBe(false);
  });

  it("asks every backend for a job it never saw", async () => {
    const { two, backends } = topology();
    two.seed(fakeDocument({ id: "doc-on-two" }));
    const submitted = await router(backends).executeAsync(
      "doc-on-two",
      "main",
      [],
    );
    const fresh = router(backends);

    const status = await fresh.getJobStatus(submitted.id);

    expect(status.documentId).toBe("doc-on-two");
    expect(fresh.describeRouting().jobs).toEqual([
      { jobId: submitted.id, backend: "two" },
    ]);
  });

  it("answers a job no backend knows as failed", async () => {
    const { backends } = topology();

    const status = await router(backends).getJobStatus("nobody-knows");

    expect(status.status).toBe(JobStatus.FAILED);
  });

  it("waits on a job no backend knows by answering it failed, by name", async () => {
    const { backends } = topology();

    const done = await router(backends).waitForJob("nobody-knows");

    expect(done.status).toBe(JobStatus.FAILED);
    expect(done.error?.name).toBe("JobNotFoundError");
    expect(done.id).toBe("nobody-knows");
  });

  it("waits on the backend that knows the job", async () => {
    const { two, backends } = topology();
    two.jobs.set("job-on-two", fakeJob("job-on-two", "doc-on-two"));

    const done = await router(backends).waitForJob("job-on-two");

    expect(done.status).toBe("READ_READY");
    expect(two.called("waitForJob")).toBe(true);
  });

  it("routes a collection id the same way placement keys it", () => {
    expect(DriveCollectionId.forDrive("drive-a").key).toBe(
      "drive.main.drive-a",
    );
    expect(memoryInfo().workflows).toBe(false);
  });
});
