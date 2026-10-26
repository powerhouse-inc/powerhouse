import type {
  IDriveReadClient,
  PagedResults,
  PagingOptions,
} from "@powerhousedao/reactor";
import type { Node } from "@powerhousedao/shared/document-drive";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
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
