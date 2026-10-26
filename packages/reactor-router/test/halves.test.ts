import {
  JobFailedError,
  JobStatus,
  type IDriveWriteClient,
  type IReactorClient,
  type IReactorReadClient,
  type IReactorWriteClient,
  type JobInfo,
  type NodeWriteHandle,
  type WriteHandle,
  type WriteReceipt,
} from "@powerhousedao/reactor";
import type { Action, PHDocument } from "@powerhousedao/shared/document-model";
import { describe, expect, it, vi } from "vitest";
import {
  CrossBackendBatchError,
  CrossBackendRelationshipError,
  FanInPartialFailureError,
  fromReactorClient,
  RoutingReactorClient,
  RoutingReadClient,
  RoutingWriteClient,
  type RoutableBackendConfig,
} from "../src/index.js";
import { FakeBackend, fakeDocument, fakeJob, silent } from "./stubs.js";

const rename = [
  { type: "SET_NAME", input: "x", scope: "global" } as unknown as Action,
];

function router(backends: RoutableBackendConfig[]): RoutingReactorClient {
  return new RoutingReactorClient(backends, { onDiagnostic: silent });
}

function twoBackends() {
  const one = new FakeBackend("one");
  const two = new FakeBackend("two");
  one.seed(
    fakeDocument({ id: "drive-a", documentType: "powerhouse/document-drive" }),
  );
  two.seed(
    fakeDocument({ id: "drive-b", documentType: "powerhouse/document-drive" }),
  );
  one.seed(fakeDocument({ id: "doc-a" }));
  two.seed(fakeDocument({ id: "doc-b" }));
  return { one, two };
}

/** A handle as a backend's own write half would hand it back. */
function backendHandle(jobId: string, document: PHDocument): WriteHandle {
  const receipt: WriteReceipt = {
    job: {
      ...fakeJob(jobId, document.header.id),
      status: JobStatus.READ_READY,
    },
    token: { version: 1, createdAtUtcIso: "", coordinates: [] },
    documentId: document.header.id,
    branch: "main",
  };
  return {
    jobId,
    documentId: document.header.id,
    branch: "main",
    written: Promise.resolve(receipt),
    readable: Promise.resolve(receipt),
    document: <T extends PHDocument>() => Promise.resolve(document as T),
  };
}

/** A backend whose writes go through a write half that records its calls. */
function withWriteHalf(fake: FakeBackend) {
  const calls: string[] = [];
  const execute = vi.fn((identifier: string) => {
    calls.push(`write.execute:${identifier}`);
    const job = fakeJob(`${fake.name}-half-${identifier}`, identifier);
    fake.jobs.set(job.id, job);
    return Promise.resolve(
      backendHandle(job.id, fake.documents.get(identifier) as PHDocument),
    );
  });
  const addFolder = vi.fn((driveIdentifier: string, name: string) => {
    calls.push(`write.drives.addFolder:${driveIdentifier}:${name}`);
    const handle = backendHandle(
      `${fake.name}-folder`,
      fake.documents.get(driveIdentifier) as PHDocument,
    );
    return Promise.resolve({ ...handle, nodeId: "folder-1" });
  });
  const write = {
    execute,
    drives: { addFolder } as unknown as IDriveWriteClient,
  } as unknown as IReactorWriteClient;
  return { config: fake.config({ backend: { ...fake.api(), write } }), calls };
}

describe("the routing halves", () => {
  it("are real halves sharing one route table", () => {
    const { one, two } = twoBackends();
    const client = router([one.config(), two.config()]);

    expect(client.read).toBeInstanceOf(RoutingReadClient);
    expect(client.write).toBeInstanceOf(RoutingWriteClient);
  });

  it("reads each document from its holder through the read half", async () => {
    const { one, two } = twoBackends();
    const client = router([one.config(), two.config()]);

    const document = await client.read.get("doc-b");

    expect(document.header.id).toBe("doc-b");
    expect(two.called("get")).toBe(true);
    expect(one.called("get")).toBe(false);
  });

  it("passes a consistency token to the holder's read", async () => {
    const one = new FakeBackend("one");
    one.seed(fakeDocument({ id: "doc-a" }));
    const api = one.api();
    const get = vi.fn((...args: Parameters<typeof api.get>) =>
      api.get(...args),
    );
    const client = router([
      one.config({ backend: { ...api, get: get as typeof api.get } }),
    ]);
    const token = { version: 1 as const, createdAtUtcIso: "", coordinates: [] };

    await client.read.get("doc-a", undefined, undefined, token);

    expect(get).toHaveBeenCalledWith("doc-a", undefined, undefined, token);
  });

  it("reads drive nodes from the drive's holder", async () => {
    const { one, two } = twoBackends();
    const drive = two.documents.get("drive-b") as PHDocument;
    (drive as { state: unknown }).state = {
      global: { nodes: [{ id: "n1", name: "n", kind: "folder" }] },
    };
    const client = router([one.config(), two.config()]);

    const node = await client.read.drives.getNode("drive-b", "n1");

    expect(node.id).toBe("n1");
    expect(one.called("get")).toBe(false);
  });
});

describe("the routing write half over a facade-only backend", () => {
  it("runs the write on the holder and hands back a completed handle", async () => {
    const { one, two } = twoBackends();
    const client = router([one.config(), two.config()]);

    const handle = await client.write.execute("doc-b", "main", rename);

    expect(handle.jobId).toBe("");
    expect(handle.documentId).toBe("doc-b");
    await expect(handle.readable).resolves.toMatchObject({
      documentId: "doc-b",
    });
    const document = await handle.document();
    expect(document.header.name).toBe("x");
    expect(two.count("execute")).toBe(1);
    expect(one.called("execute")).toBe(false);
    expect(two.count("get")).toBe(0);
  });

  it("refuses a relationship spanning backends, sending nothing", async () => {
    const { one, two } = twoBackends();
    const client = router([one.config(), two.config()]);

    await expect(
      client.write.addRelationship("doc-a", "doc-b", "child"),
    ).rejects.toThrow(CrossBackendRelationshipError);
    expect(one.called("addRelationship")).toBe(false);
    expect(two.called("addRelationship")).toBe(false);
  });

  it("refuses a batch spanning backends, sending nothing", async () => {
    const { one, two } = twoBackends();
    const client = router([one.config(), two.config()]);
    const job = (documentId: string, key: string) => ({
      key,
      documentId,
      scope: "global",
      branch: "main",
      actions: rename,
      dependsOn: [],
    });

    await expect(
      client.write.executeBatch({
        jobs: [job("doc-a", "a"), job("doc-b", "b")],
      }),
    ).rejects.toThrow(CrossBackendBatchError);
    expect(one.called("executeBatch")).toBe(false);
    expect(two.called("executeBatch")).toBe(false);
  });

  it("hands back a batch handle whose stages wait on the holder", async () => {
    const { one, two } = twoBackends();
    const client = router([one.config(), two.config()]);

    const batch = await client.write.executeBatch({
      jobs: [
        {
          key: "only",
          documentId: "doc-b",
          scope: "global",
          branch: "main",
          actions: rename,
          dependsOn: [],
        },
      ],
    });
    const receipts = await batch.readable;

    expect(Object.keys(batch.handles)).toEqual(["only"]);
    expect(receipts.only.documentId).toBe("doc-b");
    expect(two.called("waitForJob")).toBe(true);
    expect(one.called("waitForJob")).toBe(false);
  });
});

describe("a handle from a submit-only backend", () => {
  function submitting() {
    const one = new FakeBackend("one");
    one.submits = true;
    one.seed(fakeDocument({ id: "doc-1" }));
    return { one, client: router([one.config()]) };
  }

  it("is the submitted job, accepted and not waited for", async () => {
    const { one, client } = submitting();

    const handle = await client.write.execute("doc-1", "main", rename);

    expect(handle.jobId).toBe("one-submitted-doc-1");
    expect(one.methods()).toContain("submit.execute");
    expect(one.called("waitForJob")).toBe(false);
    expect(one.called("getJob")).toBe(false);
  });

  it("resolves written from the job's status once it reaches WRITE_READY", async () => {
    const { one, client } = submitting();
    const handle = await client.write.execute("doc-1", "main", rename);
    const coordinate = {
      documentId: "doc-1",
      scope: "global",
      branch: "main",
      operationIndex: 1,
    };
    let settled = false;
    const written = handle.written.then((receipt) => {
      settled = true;
      return receipt;
    });

    await vi.waitFor(() => expect(one.called("getJob")).toBe(true));
    expect(settled).toBe(false);
    const job = one.jobs.get(handle.jobId) as JobInfo;
    one.jobs.set(handle.jobId, {
      ...job,
      status: JobStatus.WRITE_READY,
      consistencyToken: {
        ...job.consistencyToken,
        coordinates: [coordinate],
      },
    });
    const receipt = await written;

    expect(receipt.job.status).toBe(JobStatus.WRITE_READY);
    expect(receipt.token.coordinates).toEqual([coordinate]);
    expect(receipt.documentId).toBe("doc-1");
  });

  it("rejects written with JobFailedError when the job FAILED", async () => {
    const { one, client } = submitting();
    const handle = await client.write.execute("doc-1", "main", rename);
    const job = one.jobs.get(handle.jobId) as JobInfo;
    one.jobs.set(handle.jobId, {
      ...job,
      status: JobStatus.FAILED,
      error: { name: "SomeError", message: "it broke", stack: "" },
    });

    await expect(handle.written).rejects.toBeInstanceOf(JobFailedError);
    await expect(handle.written).rejects.toThrow("it broke");
  });

  it("resolves readable through waitForJob and reads the document back", async () => {
    const { one, client } = submitting();
    const handle = await client.write.execute("doc-1", "main", rename);

    const receipt = await handle.readable;
    const document = await handle.document();

    expect(receipt.job.status).toBe(JobStatus.READ_READY);
    expect(one.called("waitForJob")).toBe(true);
    expect(document.header.id).toBe("doc-1");
  });

  it("covers a create's every job", async () => {
    const { one, client } = submitting();

    const handle = await client.write.create(fakeDocument({ id: "loose" }));

    expect(handle.jobId).toBe("one-created-loose");
    expect(handle.documentId).toBe("loose");
    await expect(handle.readable).resolves.toMatchObject({
      documentId: "loose",
    });
    expect(client.describeRouting().jobs).toEqual([
      { jobId: "one-created-loose", backend: "one" },
    ]);
    expect(one.called("create")).toBe(false);
  });
});

describe("a backend with a write half", () => {
  it("gets the write, and its handle comes back as it was", async () => {
    const { one, two } = twoBackends();
    const half = withWriteHalf(two);
    const client = router([one.config(), half.config]);

    const handle = await client.write.execute("doc-b", "main", rename);

    expect(half.calls).toEqual(["write.execute:doc-b"]);
    expect(handle.jobId).toBe("two-half-doc-b");
    expect(two.called("execute")).toBe(false);
    expect(client.describeRouting().jobs).toEqual([
      { jobId: "two-half-doc-b", backend: "two" },
    ]);
  });

  it("asks the backend that took the job for its status", async () => {
    const { one, two } = twoBackends();
    const half = withWriteHalf(two);
    const client = router([one.config(), half.config]);

    const handle = await client.write.execute("doc-b", "main", rename);
    const status = await client.read.getJobStatus(handle.jobId);

    expect(status.id).toBe(handle.jobId);
    expect(one.called("getJob")).toBe(false);
  });

  it("serves the facade's write as the half's write, then handle.document()", async () => {
    const { one, two } = twoBackends();
    const half = withWriteHalf(two);
    const client = router([one.config(), half.config]);

    const document = await client.execute("doc-b", "main", rename);

    expect(half.calls).toEqual(["write.execute:doc-b"]);
    expect(document.header.id).toBe("doc-b");
    expect(two.called("execute")).toBe(false);
  });

  it("gets drive writes through its drive half, on the drive's holder", async () => {
    const { one, two } = twoBackends();
    const half = withWriteHalf(two);
    const client = router([one.config(), half.config]);

    const handle: NodeWriteHandle = await client.write.drives.addFolder(
      "drive-b",
      "folder",
    );

    expect(half.calls).toEqual(["write.drives.addFolder:drive-b:folder"]);
    expect(handle.nodeId).toBe("folder-1");
    expect(handle.documentId).toBe("drive-b");
    expect(one.called("executeBatch")).toBe(false);
  });
});

describe("fromReactorClient", () => {
  it("carries the client's halves", () => {
    const read = { get: vi.fn() } as unknown as IReactorReadClient;
    const write = { execute: vi.fn() } as unknown as IReactorWriteClient;

    const backend = fromReactorClient({
      read,
      write,
    } as unknown as IReactorClient);

    expect(backend.read).toBe(read);
    expect(backend.write).toBe(write);
  });

  it("carries no half a client lacks", () => {
    const backend = fromReactorClient({} as IReactorClient);

    expect("read" in backend).toBe(false);
    expect("write" in backend).toBe(false);
  });
});

describe("an id check with the remote backend down", () => {
  /** A local backend that answers, and a remote one whose every probe fails. */
  function remoteDown(localTaken: boolean) {
    const local = new FakeBackend("local");
    const remote = new FakeBackend("remote");
    if (localTaken) {
      local.seed(fakeDocument({ id: "doc-1" }));
    }
    remote.failing.add("isServed");
    remote.failing.add("isDocumentIdTaken");
    return { local, remote };
  }

  const fallBackToLocal = (
    _documentId: string,
    error: unknown,
  ): boolean | undefined =>
    error instanceof FanInPartialFailureError &&
    error.failures.every((failure) => failure.backend === "remote")
      ? false
      : undefined;

  it("answers from the local backend on the write half and the facade", async () => {
    const free = remoteDown(false);
    const client = new RoutingReactorClient(
      [free.local.config(), free.remote.config()],
      { onDiagnostic: silent, answerFailedIdCheck: fallBackToLocal },
    );

    await expect(client.write.isDocumentIdTaken("doc-1")).resolves.toBe(false);
    await expect(client.isDocumentIdTaken("doc-1")).resolves.toBe(false);
    expect(free.local.called("isDocumentIdTaken")).toBe(true);

    const taken = remoteDown(true);
    const again = new RoutingReactorClient(
      [taken.local.config(), taken.remote.config()],
      { onDiagnostic: silent, answerFailedIdCheck: fallBackToLocal },
    );
    await expect(again.write.isDocumentIdTaken("doc-1")).resolves.toBe(true);
  });

  it("still fails when the local backend cannot answer either", async () => {
    const { local, remote } = remoteDown(false);
    local.failing.add("isServed");
    const client = new RoutingReactorClient([local.config(), remote.config()], {
      onDiagnostic: silent,
      answerFailedIdCheck: fallBackToLocal,
    });

    await expect(client.write.isDocumentIdTaken("doc-1")).rejects.toThrow(
      FanInPartialFailureError,
    );
  });

  it("fails without a fallback", async () => {
    const { local, remote } = remoteDown(false);
    const client = router([local.config(), remote.config()]);

    await expect(client.write.isDocumentIdTaken("doc-1")).rejects.toThrow(
      FanInPartialFailureError,
    );
  });
});
