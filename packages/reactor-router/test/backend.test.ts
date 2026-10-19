import type { IReactorClient } from "@powerhousedao/reactor";
import { describe, expect, it, vi } from "vitest";
import { fromReactorClient, RouterBackend } from "../src/backend.js";
import { UNKNOWN_REACTOR_INFO } from "../src/types.js";
import { FakeBackend, IN_PROCESS, memoryInfo } from "./stubs.js";

describe("fromReactorClient", () => {
  it("is a plain object declaring every optional member", () => {
    const backend = fromReactorClient({} as IReactorClient);

    expect(Object.getPrototypeOf(backend)).toBe(Object.prototype);
    for (const member of [
      "isDocumentIdTaken",
      "resolveIdOrSlug",
      "evaluateActions",
      "loadBatch",
      "addRelationship",
      "updateRelationship",
      "removeRelationship",
      "moveRelationship",
      "getDocumentModelModules",
      "getDocumentModelModule",
    ]) {
      expect(
        typeof (backend as unknown as Record<string, unknown>)[member],
      ).toBe("function");
    }
  });

  it("does not inherit members a catch-all proxy would invent", () => {
    const proxy = new Proxy({} as IReactorClient, {
      get: () => () => Promise.resolve("invented"),
    });
    const backend = fromReactorClient(proxy);

    expect("someUnknownMember" in backend).toBe(false);
  });

  it("forwards each call with its arguments", async () => {
    const get = vi.fn(() => Promise.resolve({ header: { id: "doc" } }));
    const backend = fromReactorClient({ get } as unknown as IReactorClient);
    const signal = new AbortController().signal;

    await backend.get("doc", { branch: "main" }, signal);

    expect(get).toHaveBeenCalledWith("doc", { branch: "main" }, signal);
  });
});

describe("fromReactorClient submit", () => {
  it("submits through the client's non-waiting executeAsync and createAsync", async () => {
    const executeAsync = vi.fn(() => Promise.resolve({ id: "job-1" }));
    const createAsync = vi.fn(() => Promise.resolve({ jobs: {} }));
    const backend = fromReactorClient({
      executeAsync,
      createAsync,
    } as unknown as IReactorClient);
    const signal = new AbortController().signal;
    const document = { header: { id: "doc" } } as never;

    await backend.submit?.execute("doc", "main", [], signal);
    await backend.submit?.create(document, "drive", signal);

    expect(executeAsync).toHaveBeenCalledWith("doc", "main", [], signal);
    expect(createAsync).toHaveBeenCalledWith(document, "drive", signal);
  });
});

describe("RouterBackend facts", () => {
  it("holds static facts as known", () => {
    const handle = new FakeBackend("one").handle();

    expect(handle.facts).toMatchObject({
      reactor: memoryInfo(),
      reach: IN_PROCESS,
      known: true,
    });
  });

  it("reads lazy facts on refresh", async () => {
    const info = memoryInfo(["gql"]);
    const handle = new FakeBackend("one").handle({
      facts: () => Promise.resolve(info),
    });
    expect(handle.facts.known).toBe(false);

    await handle.refreshFacts(() => {});

    expect(handle.facts).toMatchObject({ reactor: info, known: true });
  });

  it("reports a failed read and places the backend as unknown", async () => {
    const reported: string[] = [];
    const handle = new RouterBackend(
      new FakeBackend("one").config({
        facts: () => Promise.reject(new Error("inspector down")),
      }),
    );

    await handle.refreshFacts((message) => reported.push(message));

    expect(handle.facts).toMatchObject({
      reactor: UNKNOWN_REACTOR_INFO,
      known: false,
    });
    expect(reported.join()).toMatch(/one could not report its facts/);
  });
});
