import { DriveCollectionId } from "@powerhousedao/reactor";
import type { Action } from "@powerhousedao/shared/document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UnknownBackendError } from "../src/errors.js";
import { RoutingReactorClient } from "../src/routing-client.js";
import type { RoutingChange } from "../src/types.js";
import { FakeBackend, fakeDocument, REMOTE } from "./stubs.js";

const rename = [
  { type: "SET_NAME", input: "renamed", scope: "global" },
] as unknown as Action[];

function setup(collections: Readonly<Record<string, string>> = {}): {
  local: FakeBackend;
  remote: FakeBackend;
  client: RoutingReactorClient;
  reported: string[];
} {
  const local = new FakeBackend("local");
  const remote = new FakeBackend("remote", undefined, REMOTE);
  local.refuses = true;
  remote.refuses = true;
  const reported: string[] = [];
  const client = new RoutingReactorClient([local.config(), remote.config()], {
    collections,
    onDiagnostic: (message) => reported.push(message),
  });
  return { local, remote, client, reported };
}

const rowFor = (client: RoutingReactorClient, key: string) =>
  client
    .describeRouting()
    .collections.find((entry) => entry.collectionId === key);

describe("setPlacement", () => {
  it("places a drive above the config, and resets to it when cleared", async () => {
    const { local, remote, client } = setup({ drive: "local" });
    local.seed(fakeDocument({ id: "drive" }));
    remote.seed(fakeDocument({ id: "drive" }));

    client.setPlacement("drive", "remote");
    await client.write.drives.addFolder("drive", "f");

    expect(rowFor(client, "drive")).toEqual({
      collectionId: "drive",
      backend: "remote",
      source: "override",
      origin: "runtime",
      configured: "local",
    });

    client.setPlacement("drive", undefined);
    expect(rowFor(client, "drive")).toEqual({
      collectionId: "drive",
      backend: "local",
      source: "override",
      origin: "config",
      configured: "local",
    });
  });

  it("routes by the runtime placement over the config", async () => {
    const { local, remote, client } = setup({ drive: "local" });
    local.seed(fakeDocument({ id: "drive" }));
    remote.seed(fakeDocument({ id: "drive" }));

    client.setPlacement("drive", "remote");
    await client.write.drives.addFolder("drive", "folder");
    await client.write.execute("drive", "main", rename);

    expect(remote.count("execute")).toBe(2);
    expect(local.count("execute")).toBe(0);
  });

  it("is corrected by a refusal, naming the runtime placement as stale", async () => {
    const { local, client, reported } = setup();
    local.seed(fakeDocument({ id: "drive" }));

    client.setPlacement("drive", "remote");
    await client.write.drives.addFolder("drive", "folder");

    const key = DriveCollectionId.forDrive("drive").key;
    expect(rowFor(client, key)).toMatchObject({
      backend: "local",
      source: "corrected",
    });
    expect(rowFor(client, "drive")).toMatchObject({
      backend: "remote",
      source: "override",
      origin: "runtime",
    });
    expect(reported.join("\n")).toMatch(
      /runtime placement for drive\.main\.drive names remote.*The placement is stale/,
    );
  });

  it("replaces a correction for the same drive", async () => {
    const { local, remote, client } = setup({ drive: "remote" });
    local.seed(fakeDocument({ id: "drive" }));
    await client.write.drives.addFolder("drive", "folder");
    const key = DriveCollectionId.forDrive("drive").key;
    expect(rowFor(client, key)).toMatchObject({ source: "corrected" });

    remote.seed(fakeDocument({ id: "drive" }));
    local.documents.clear();
    client.setPlacement("drive", "remote");

    expect(rowFor(client, key)).toBeUndefined();
    const remoteBefore = remote.count("execute");
    await client.write.drives.addFolder("drive", "again");
    expect(remote.count("execute")).toBe(remoteBefore + 1);
    expect(local.count("execute")).toBe(1);
  });

  it("moves the documents already routed in the drive", async () => {
    const local = new FakeBackend("local");
    const remote = new FakeBackend("remote", undefined, REMOTE);
    for (const backend of [local, remote]) {
      backend.seed(fakeDocument({ id: "drive" }));
      backend.seed(fakeDocument({ id: "file" }));
      backend.relationships.push({
        sourceId: "drive",
        targetId: "file",
        relationshipType: "child",
      });
    }
    const client = new RoutingReactorClient([local.config(), remote.config()], {
      collections: { drive: "local" },
      onDiagnostic: () => {},
    });
    await client.read.get("file");
    expect(local.count("get")).toBe(1);

    client.setPlacement("drive", "remote");
    await client.read.get("file");

    expect(remote.count("get")).toBe(1);
    expect(local.count("get")).toBe(1);
  });

  it("keeps seeded document routes across a placement change", async () => {
    const local = new FakeBackend("local");
    const remote = new FakeBackend("remote", undefined, REMOTE);
    const client = new RoutingReactorClient([local.config(), remote.config()], {
      documents: { pinned: "remote" },
      onDiagnostic: () => {},
    });
    local.seed(fakeDocument({ id: "other" }));
    await client.locate("other");
    expect(client.describeRouting().documents).toHaveLength(2);

    client.setPlacement("drive", "remote");

    expect(client.describeRouting().documents).toEqual([
      { identifier: "pinned", backend: "remote" },
    ]);
  });

  it("refuses a backend the router does not hold", () => {
    const { client } = setup();

    expect(() => client.setPlacement("drive", "elsewhere")).toThrow(
      UnknownBackendError,
    );
  });

  describe("with provisional routes", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["Date"] });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("never expires", () => {
      const { client } = setup();
      client.setPlacement("drive", "remote");

      vi.advanceTimersByTime(60 * 60 * 1000);

      expect(rowFor(client, "drive")).toMatchObject({
        backend: "remote",
        origin: "runtime",
      });
    });
  });
});

describe("onRoutingChange", () => {
  it("reports placements, learned and corrected routes, and stops on unsubscribe", async () => {
    const { local, client } = setup();
    local.seed(fakeDocument({ id: "drive" }));
    const changes: RoutingChange[] = [];
    const unsubscribe = client.onRoutingChange((change) =>
      changes.push(change),
    );

    client.setPlacement("drive", "remote");
    client.setPlacement("drive", "remote");
    await client.write.drives.addFolder("drive", "folder");
    unsubscribe();
    client.setPlacement("drive", undefined);

    const key = DriveCollectionId.forDrive("drive").key;
    expect(changes).toEqual([
      { key: "drive", reason: "placement" },
      { key, reason: "learned" },
      { key, reason: "corrected" },
    ]);
  });

  it("reports a learned route", async () => {
    const { local, client } = setup();
    local.seed(fakeDocument({ id: "drive" }));
    const changes: RoutingChange[] = [];
    client.onRoutingChange((change) => changes.push(change));

    await client.write.drives.addFolder("drive", "folder");

    expect(changes).toEqual([
      { key: DriveCollectionId.forDrive("drive").key, reason: "learned" },
    ]);
  });

  it("reports a listener that throws and keeps calling the others", () => {
    const { client, reported } = setup();
    const changes: RoutingChange[] = [];
    client.onRoutingChange(() => {
      throw new Error("boom");
    });
    client.onRoutingChange((change) => changes.push(change));

    client.setPlacement("drive", "remote");

    expect(changes).toHaveLength(1);
    expect(reported.join("\n")).toMatch(/routing change listener failed.*boom/);
  });
});
