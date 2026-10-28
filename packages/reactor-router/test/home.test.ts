import type { Action } from "@powerhousedao/shared/document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoutingReactorClient } from "../src/routing-client.js";
import { FakeBackend, fakeDocument, REMOTE, silent } from "./stubs.js";

const DRIVE_TYPE = "powerhouse/document-drive";

/** Seeds a drive and a file it holds as a child. */
function holdDriveAndFile(backend: FakeBackend): void {
  backend.seed(fakeDocument({ id: "drive", documentType: DRIVE_TYPE }));
  backend.seed(fakeDocument({ id: "file" }));
  backend.relationships.push({
    sourceId: "drive",
    targetId: "file",
    relationshipType: "child",
  });
}

function routerOver(
  order: readonly FakeBackend[],
  collections: Readonly<Record<string, string>>,
): RoutingReactorClient {
  return new RoutingReactorClient(
    order.map((backend) => backend.config()),
    { collections, onDiagnostic: silent },
  );
}

const rename = [
  { type: "SET_NAME", input: "renamed", scope: "global" },
] as unknown as Action[];

describe("homeOf: an id several backends serve routes by its collection", () => {
  it("routes a file in a synced drive to local, with the remote first in the order", async () => {
    const local = new FakeBackend("local");
    const remote = new FakeBackend("remote", undefined, REMOTE);
    holdDriveAndFile(local);
    holdDriveAndFile(remote);
    const client = routerOver([remote, local], { drive: "local" });

    await client.read.get("file");

    expect(local.count("get")).toBe(1);
    expect(remote.count("get")).toBe(0);
    expect(client.describeRouting().documents).toContainEqual({
      identifier: "file",
      backend: "local",
    });
  });

  it("routes a file in a drive placed on the remote there, past a stale local copy", async () => {
    const local = new FakeBackend("local");
    const remote = new FakeBackend("remote", undefined, REMOTE);
    holdDriveAndFile(local);
    holdDriveAndFile(remote);
    const client = routerOver([local, remote], { drive: "remote" });

    await client.read.get("file");
    await client.write.execute("file", "main", rename);

    expect(remote.count("get")).toBe(1);
    expect(remote.count("execute")).toBe(1);
    expect(local.count("get")).toBe(0);
    expect(local.count("execute")).toBe(0);
  });

  it("runs a batch on a file held on both on its collection's home", async () => {
    const local = new FakeBackend("local");
    const remote = new FakeBackend("remote", undefined, REMOTE);
    holdDriveAndFile(local);
    holdDriveAndFile(remote);
    const client = routerOver([local, remote], { drive: "remote" });

    await client.write.executeBatch({
      jobs: [
        {
          key: "rename",
          documentId: "file",
          scope: "global",
          branch: "main",
          actions: rename,
          dependsOn: [],
        },
      ],
    });

    expect(remote.count("executeBatch")).toBe(1);
    expect(local.count("executeBatch")).toBe(0);
  });

  it("routes a drive held on both to its placement", async () => {
    const local = new FakeBackend("local");
    const remote = new FakeBackend("remote", undefined, REMOTE);
    holdDriveAndFile(local);
    holdDriveAndFile(remote);
    const client = routerOver([local, remote], { drive: "remote" });

    await client.read.get("drive");

    expect(remote.count("get")).toBe(1);
    expect(local.count("get")).toBe(0);
  });

  it("falls back to the backend order when the collection has no route", async () => {
    const local = new FakeBackend("local");
    const remote = new FakeBackend("remote", undefined, REMOTE);
    holdDriveAndFile(local);
    holdDriveAndFile(remote);
    const client = routerOver([remote, local], {});

    await client.read.get("file");

    expect(remote.count("get")).toBe(1);
  });

  it("falls back to the backend order when the home lookup fails", async () => {
    const local = new FakeBackend("local");
    const remote = new FakeBackend("remote", undefined, REMOTE);
    holdDriveAndFile(local);
    holdDriveAndFile(remote);
    remote.failing.add("getIncomingRelationships");
    const reported: string[] = [];
    const client = new RoutingReactorClient([remote.config(), local.config()], {
      collections: { drive: "local" },
      onDiagnostic: (message) => reported.push(message),
    });

    await client.read.get("file");

    expect(remote.count("get")).toBe(1);
    expect(reported.join("\n")).toMatch(/home lookup: remote could not name/);
  });

  describe("with provisional routes", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("routes a file only the remote holds there, then to local once local holds it", async () => {
      const local = new FakeBackend("local");
      const remote = new FakeBackend("remote", undefined, REMOTE);
      local.seed(fakeDocument({ id: "drive", documentType: DRIVE_TYPE }));
      holdDriveAndFile(remote);
      const client = routerOver([local, remote], { drive: "local" });

      await client.read.get("file");
      expect(remote.count("get")).toBe(1);

      holdDriveAndFile(local);
      vi.advanceTimersByTime(30_000);
      await client.read.get("file");

      expect(local.count("get")).toBe(1);
      expect(remote.count("get")).toBe(1);
    });
  });
});
