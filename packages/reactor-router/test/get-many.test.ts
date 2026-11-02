import { describe, expect, it } from "vitest";
import { RoutingReactorClient } from "../src/index.js";
import { FakeBackend, fakeDocument, silent } from "./stubs.js";

const ids = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, i) => `${prefix}-${i}`);

function seeded(name: string, documentIds: readonly string[]): FakeBackend {
  const backend = new FakeBackend(name);
  for (const id of documentIds) {
    backend.seed(fakeDocument({ id }));
  }
  return backend;
}

function router(...backends: FakeBackend[]): RoutingReactorClient {
  return new RoutingReactorClient(
    backends.map((backend) => backend.config()),
    { onDiagnostic: silent },
  );
}

describe("getMany through the router", () => {
  it("reads 240 ids from a single backend in one getMany, without probes", async () => {
    const all = ids("doc", 240);
    const only = seeded("only", all);
    const client = router(only);

    const documents = await client.getMany(all);

    expect(documents.map((d) => d.header.id)).toEqual(all);
    expect(only.count("getMany")).toBe(1);
    expect(only.count("isServed")).toBe(0);
    expect(only.count("get")).toBe(0);
  });

  it("reads routed ids with one getMany per backend and no probes", async () => {
    const onOne = ids("one", 120);
    const onTwo = ids("two", 120);
    const one = seeded("one", onOne);
    const two = seeded("two", onTwo);
    const client = router(one, two);
    const mixed = onOne.flatMap((id, i) => [id, onTwo[i]]);
    await client.getMany(mixed);
    const probes = one.count("isServed") + two.count("isServed");

    const documents = await client.getMany(mixed);

    expect(documents.map((d) => d.header.id)).toEqual(mixed);
    expect(one.count("isServed") + two.count("isServed")).toBe(probes);
    expect(one.count("getMany")).toBe(2);
    expect(two.count("getMany")).toBe(2);
    expect(one.count("get") + two.count("get")).toBe(0);
  });

  it("probes unrouted ids once per backend, then reads one getMany per backend", async () => {
    const onOne = ids("one", 3);
    const onTwo = ids("two", 2);
    const one = seeded("one", onOne);
    const two = seeded("two", onTwo);
    const client = router(one, two);

    const documents = await client.getMany([...onTwo, ...onOne]);

    expect(documents.map((d) => d.header.id)).toEqual([...onTwo, ...onOne]);
    expect(one.count("isServed")).toBe(5);
    expect(two.count("isServed")).toBe(5);
    expect(one.calls.filter((c) => c.method === "getMany")).toEqual([
      { method: "getMany", args: [onOne] },
    ]);
    expect(two.calls.filter((c) => c.method === "getMany")).toEqual([
      { method: "getMany", args: [onTwo] },
    ]);
    expect(one.count("get") + two.count("get")).toBe(0);
  });

  it("reads each id with get on a backend that does not declare getMany", async () => {
    const all = ids("doc", 4);
    const only = seeded("only", all);
    only.undeclared.add("getMany");
    const client = router(only);

    const documents = await client.getMany(all);

    expect(documents.map((d) => d.header.id)).toEqual(all);
    expect(only.count("get")).toBe(4);
  });

  it("keeps duplicates and order, reading each id once", async () => {
    const only = seeded("only", ["a", "b"]);
    const client = router(only);

    const documents = await client.getMany(["b", "a", "b"]);

    expect(documents.map((d) => d.header.id)).toEqual(["b", "a", "b"]);
    expect(only.calls.filter((c) => c.method === "getMany")).toEqual([
      { method: "getMany", args: [["b", "a"]] },
    ]);
  });

  it("rejects when an id is missing", async () => {
    const only = seeded("only", ["a"]);
    const client = router(only);

    await expect(client.getMany(["a", "missing"])).rejects.toThrow(
      /found no document "missing"/,
    );
  });
});
