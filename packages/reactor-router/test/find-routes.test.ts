import { describe, expect, it } from "vitest";
import { RoutingReactorClient } from "../src/routing-client.js";
import { FakeBackend, fakeDocument, REMOTE, silent } from "./stubs.js";

const DRIVE_TYPE = "powerhouse/document-drive";

function routerOver(
  order: readonly FakeBackend[],
  collections: Readonly<Record<string, string>> = {},
): RoutingReactorClient {
  return new RoutingReactorClient(
    order.map((backend) => backend.config()),
    { collections, onDiagnostic: silent },
  );
}

/** The local and remote copies of one drive, told apart by name. */
function heldOnBoth(id: string) {
  const local = new FakeBackend("local");
  const remote = new FakeBackend("remote", undefined, REMOTE);
  local.seed(fakeDocument({ id, documentType: DRIVE_TYPE, name: "stale" }));
  remote.seed(fakeDocument({ id, documentType: DRIVE_TYPE, name: "current" }));
  return { local, remote };
}

const names = async (client: RoutingReactorClient) =>
  (await client.read.find({ type: DRIVE_TYPE })).results.map((document) => [
    document.header.id,
    document.header.name,
  ]);

describe("find: an id several backends answer for", () => {
  it("lists a drive placed on the remote from the remote, past a stale local copy", async () => {
    const { local, remote } = heldOnBoth("drive-x");
    local.seed(fakeDocument({ id: "drive-a", documentType: DRIVE_TYPE }));
    const client = routerOver([local, remote], { "drive-x": "remote" });

    expect(await names(client)).toEqual([
      ["drive-x", "current"],
      ["drive-a", "drive-a"],
    ]);
  });

  it("follows a runtime placement", async () => {
    const { local, remote } = heldOnBoth("drive-x");
    const client = routerOver([local, remote], { "drive-x": "local" });
    expect(await names(client)).toEqual([["drive-x", "stale"]]);

    client.setPlacement("drive-x", "remote");
    expect(await names(client)).toEqual([["drive-x", "current"]]);
  });

  it("lists a document from its known route", async () => {
    const local = new FakeBackend("local");
    const remote = new FakeBackend("remote", undefined, REMOTE);
    local.seed(fakeDocument({ id: "doc", name: "stale" }));
    remote.seed(fakeDocument({ id: "doc", name: "current" }));
    const client = new RoutingReactorClient([local.config(), remote.config()], {
      documents: { doc: "remote" },
      onDiagnostic: silent,
    });

    const { results } = await client.read.find({ type: "test/document" });
    expect(results.map((document) => document.header.name)).toEqual([
      "current",
    ]);
  });

  it("keeps the first backend's copy when nothing routes the id", async () => {
    const { local, remote } = heldOnBoth("drive-x");
    const client = routerOver([local, remote]);
    expect(await names(client)).toEqual([["drive-x", "stale"]]);
    expect(remote.count("isServed")).toBe(0);
    expect(local.count("isServed")).toBe(0);
  });
});
