import type {
  BatchExecutionRequest,
  IDriveNodeSource,
  IDriveReadClient,
  PagedResults,
  PagingOptions,
} from "@powerhousedao/reactor";
import type { Node } from "@powerhousedao/shared/document-drive";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import { describe, expect, it, vi } from "vitest";
import { RoutingReactorClient } from "../src/index.js";
import { FakeBackend, fakeDocument, silent } from "./stubs.js";

const DRIVE = "powerhouse/document-drive";

const fileNode: Node = {
  id: "node-1",
  name: "a.txt",
  kind: "file",
  parentFolder: null,
  documentType: "test/document",
} as Node;

/** A drive-node read client that records every call. */
function recordingDrives() {
  const calls: { method: string; args: readonly unknown[] }[] = [];
  const page: PagedResults<Node> = {
    results: [fileNode],
    options: { cursor: "c1", limit: 10 },
    nextCursor: "c2",
  };
  const drives: IDriveReadClient = {
    getNode: (driveIdentifier, nodeId, signal) => {
      calls.push({
        method: "getNode",
        args: [driveIdentifier, nodeId, signal],
      });
      return Promise.resolve(fileNode);
    },
    listNodes: (driveIdentifier, parentFolder, paging, signal) => {
      calls.push({
        method: "listNodes",
        args: [driveIdentifier, parentFolder, paging, signal],
      });
      return Promise.resolve(page);
    },
  };
  return { drives, calls, page };
}

function driveWithNodes(id: string): PHDocument {
  const drive = fakeDocument({ id, documentType: DRIVE });
  return {
    ...drive,
    state: { global: { nodes: [fileNode] } },
  } as unknown as PHDocument;
}

function topology(withDrives: boolean) {
  const one = new FakeBackend("one");
  const two = new FakeBackend("two");
  two.seed(driveWithNodes("drive-b"));
  const recording = recordingDrives();
  const client = new RoutingReactorClient(
    [
      one.config(),
      two.config(
        withDrives
          ? { backend: { ...two.api(), drives: recording.drives } }
          : {},
      ),
    ],
    { onDiagnostic: silent },
  );
  return { one, two, client, ...recording };
}

const probes = (...backends: FakeBackend[]) =>
  backends.reduce((sum, backend) => sum + backend.count("isServed"), 0);

describe("drive node reads through the router", () => {
  it("probes an unrouted drive, then serves it from the holder's drives", async () => {
    const { one, two, client, calls, page } = topology(true);
    const paging: PagingOptions = { cursor: "c1", limit: 10 };

    const result = await client.read.drives.listNodes("drive-b", null, paging);

    expect(result).toBe(page);
    expect(probes(one, two)).toBeGreaterThan(0);
    expect(calls).toEqual([
      { method: "listNodes", args: ["drive-b", null, paging, undefined] },
    ]);
    expect(one.count("get") + two.count("get")).toBe(0);
  });

  it("serves a routed drive with one drives.listNodes call, no probe and no document read", async () => {
    const { one, two, client, calls } = topology(true);
    await client.read.drives.listNodes("drive-b");
    const probed = probes(one, two);
    calls.length = 0;
    const paging: PagingOptions = { cursor: "c2", limit: 5 };

    const result = await client.read.drives.listNodes(
      "drive-b",
      "folder-1",
      paging,
    );

    expect(result.nextCursor).toBe("c2");
    expect(calls).toEqual([
      { method: "listNodes", args: ["drive-b", "folder-1", paging, undefined] },
    ]);
    expect(probes(one, two)).toBe(probed);
    expect(one.count("get") + two.count("get")).toBe(0);
  });

  it("serves getNode from the holder's drives", async () => {
    const { two, client, calls } = topology(true);

    const node = await client.read.drives.getNode("drive-b", "node-1");

    expect(node.id).toBe("node-1");
    expect(calls).toEqual([
      { method: "getNode", args: ["drive-b", "node-1", undefined] },
    ]);
    expect(two.count("get")).toBe(0);
  });

  it("falls back to the drive's state on a backend without drives", async () => {
    const { two, client, calls } = topology(false);

    const result = await client.read.drives.listNodes("drive-b");

    expect(result.results.map((node) => node.id)).toEqual(["node-1"]);
    expect(two.count("get")).toBeGreaterThan(0);
    expect(calls).toEqual([]);
  });
});

describe("removing a node from a drive with no nodes in its state", () => {
  const REACTOR_DRIVE = "powerhouse/reactor-drive";
  const folder = {
    id: "folder-1",
    name: "invoices",
    kind: "folder",
    parentFolder: null,
  } as Node;
  const nested = {
    id: "file-2",
    name: "b.pdf",
    kind: "file",
    parentFolder: "folder-1",
    documentType: "test/document",
  } as Node;

  function reactorDrive({ submits = false } = {}) {
    const backend = new FakeBackend("one");
    backend.submits = submits;
    backend.seed({
      ...fakeDocument({ id: "drive-r", documentType: REACTOR_DRIVE }),
      state: { global: { name: "Files" } },
    } as unknown as PHDocument);
    backend.seed(fakeDocument({ id: "file-1", documentType: "test/document" }));
    backend.seed(fakeDocument({ id: "file-2", documentType: "test/document" }));
    const drives: IDriveReadClient = {
      getNode: () => Promise.reject(new Error("not asked")),
      listNodes: () =>
        Promise.resolve({
          results: [folder, nested],
          options: { cursor: "", limit: 10 },
        }),
    };
    const client = new RoutingReactorClient(
      [backend.config({ backend: { ...backend.api(), drives } })],
      { onDiagnostic: silent },
    );
    return { backend, client };
  }

  /** Each batched job's document and action types, in submission order. */
  function submitted(backend: FakeBackend) {
    return backend.calls
      .filter((call) => call.method === "executeBatch")
      .flatMap((call) => (call.args[0] as BatchExecutionRequest).jobs)
      .map((job) => [
        job.documentId,
        job.actions.map((action) => action.type).join(","),
      ]);
  }

  it("removes a file from the drive and deletes its document", async () => {
    const { backend, client } = reactorDrive();

    await client.write.drives.removeNode("drive-r", "file-1");

    expect(submitted(backend)).toEqual([
      ["drive-r", "DELETE_NODE"],
      ["file-1", "DELETE_DOCUMENT"],
      ["drive-r", "REMOVE_RELATIONSHIP"],
    ]);
  });

  it("removes a folder and the files under it, found through the node reads", async () => {
    const { backend, client } = reactorDrive();

    await client.write.drives.removeNode("drive-r", "folder-1");

    expect(submitted(backend)).toEqual([
      ["drive-r", "DELETE_NODE"],
      ["file-2", "DELETE_DOCUMENT"],
      ["drive-r", "REMOVE_RELATIONSHIP"],
    ]);
    expect(backend.count("execute")).toBe(1);
    const [, actions] = backend.calls.find((call) => call.method === "execute")!
      .args as [string, { type: string; input: { id: string } }[]];
    expect(actions.map((action) => [action.type, action.input.id])).toEqual([
      ["DELETE_NODE", "folder-1"],
    ]);
  });

  it("asks for a folder's subtree rather than paging through the drive", async () => {
    const { backend } = reactorDrive();
    const getDescendants = vi.fn().mockResolvedValue([
      { ...folder, parentFolder: null, documentType: null },
      { ...nested, documentType: "test/document" },
    ]);
    const listNodes = vi.fn();
    const client = new RoutingReactorClient(
      [
        backend.config({
          backend: {
            ...backend.api(),
            drives: {
              getNode: () => Promise.reject(new Error("not asked")),
              listNodes,
            },
            driveNodes: { getDescendants } as unknown as IDriveNodeSource,
          },
        }),
      ],
      { onDiagnostic: silent },
    );

    await client.write.drives.removeNode("drive-r", "folder-1");

    expect(getDescendants).toHaveBeenCalledWith(
      "drive-r",
      "folder-1",
      undefined,
    );
    expect(listNodes).not.toHaveBeenCalled();
    expect(submitted(backend)).toEqual([
      ["drive-r", "DELETE_NODE"],
      ["file-2", "DELETE_DOCUMENT"],
      ["drive-r", "REMOVE_RELATIONSHIP"],
    ]);
  });

  it("removes a folder through the backend's submit, so no request outlasts it", async () => {
    const { backend, client } = reactorDrive({ submits: true });

    await client.write.drives.removeNode("drive-r", "folder-1");

    expect(backend.count("submit.execute")).toBe(1);
    expect(backend.count("execute")).toBe(0);
    expect(backend.count("waitForJob")).toBeGreaterThan(0);
  });

  it("removes every link type the backend declares with the file", async () => {
    const { backend } = reactorDrive();
    const client = new RoutingReactorClient(
      [
        backend.config({
          backend: {
            ...backend.api(),
            driveFileLinkTypes: ["child", "drive/child"],
          },
        }),
      ],
      { onDiagnostic: silent },
    );

    await client.write.drives.removeNode("drive-r", "file-1");

    expect(submitted(backend).at(-1)).toEqual([
      "drive-r",
      "REMOVE_RELATIONSHIP,REMOVE_RELATIONSHIP",
    ]);
    const links = backend.calls
      .filter((call) => call.method === "executeBatch")
      .flatMap((call) => (call.args[0] as BatchExecutionRequest).jobs)
      .flatMap((job) => job.actions)
      .filter((action) => action.type === "REMOVE_RELATIONSHIP")
      .map(
        (action) =>
          (action.input as { relationshipType: string }).relationshipType,
      );
    expect(links).toEqual(["child", "drive/child"]);
  });

  it("reports an identifier that is neither a document nor a node", async () => {
    const { client } = reactorDrive();

    await expect(
      client.write.drives.removeNode("drive-r", "missing"),
    ).rejects.toThrow();
  });
});

describe("a backend whose submit has no create", () => {
  it("writes through submit and creates through its waiting member", async () => {
    const backend = new FakeBackend("one");
    backend.submits = true;
    const api = backend.api();
    const client = new RoutingReactorClient(
      [
        backend.config({
          backend: {
            ...api,
            submit: {
              execute: (identifier, branch, actions, signal) =>
                api.submit!.execute(identifier, branch, actions, signal),
            },
          },
        }),
      ],
      { onDiagnostic: silent },
    );

    const created = await client.write.create(
      fakeDocument({ id: "doc-1", documentType: "test/document" }),
    );
    await created.readable;
    await client.write.execute("doc-1", "main", []);

    expect(backend.count("create")).toBe(1);
    expect(backend.count("submit.create")).toBe(0);
    expect(backend.count("submit.execute")).toBe(1);
    expect(backend.count("execute")).toBe(0);
  });
});
