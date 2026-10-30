import { describe, expect, it } from "vitest";
import { RoutingReactorClient } from "../src/routing-client.js";
import { FakeBackend, fakeDocument, REMOTE, silent } from "./stubs.js";

function setup(): {
  local: FakeBackend;
  remote: FakeBackend;
  client: RoutingReactorClient;
} {
  const local = new FakeBackend("local");
  const remote = new FakeBackend("remote", undefined, REMOTE);
  const client = new RoutingReactorClient([local.config(), remote.config()], {
    collections: { "new-doc": "local" },
    onDiagnostic: silent,
  });
  return { local, remote, client };
}

describe("locate", () => {
  it("names the backend that holds a document", async () => {
    const { remote, client } = setup();
    remote.seed(fakeDocument({ id: "doc" }));

    await expect(client.locate("doc")).resolves.toBe("remote");
    expect(client.describeRouting().documents).toContainEqual({
      identifier: "doc",
      backend: "remote",
    });
  });

  it("names the placement of an id no backend holds", async () => {
    const { client } = setup();

    await expect(client.locate("new-doc")).resolves.toBe("local");
  });

  it("answers from the cached route without probing", async () => {
    const { local, remote, client } = setup();
    local.seed(fakeDocument({ id: "doc" }));
    await client.locate("doc");
    const probes = local.count("isServed") + remote.count("isServed");

    await expect(client.locate("doc")).resolves.toBe("local");
    expect(local.count("isServed") + remote.count("isServed")).toBe(probes);
  });

  it("rejects when the signal is already aborted", async () => {
    const { client } = setup();
    const controller = new AbortController();
    controller.abort(new Error("gone"));

    await expect(client.locate("doc", controller.signal)).rejects.toThrow(
      "gone",
    );
  });
});
