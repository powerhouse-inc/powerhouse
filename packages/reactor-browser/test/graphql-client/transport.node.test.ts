import { describe, expect, it, vi } from "vitest";
import {
  isNodeFetch,
  switchboardFetch,
  withStreamedBodies,
  type GraphQLFetch,
} from "../../src/graphql-client/transport.js";

function spyFetch() {
  const inner = vi.fn<GraphQLFetch>(() => Promise.resolve(new Response("{}")));
  return inner;
}

describe("the Switchboard transport under Node", () => {
  it("knows it runs on Node's fetch", () => {
    expect(isNodeFetch()).toBe(true);
  });

  it("streams a string body, half duplex", async () => {
    const inner = spyFetch();
    await withStreamedBodies(inner)("http://sb/graphql", {
      method: "POST",
      body: '{"query":"{ __typename }"}',
    });

    const init = inner.mock.calls[0][1] as RequestInit & { duplex?: string };
    expect(init.body).toBeInstanceOf(ReadableStream);
    expect(init.duplex).toBe("half");
    expect(await new Response(init.body).text()).toBe(
      '{"query":"{ __typename }"}',
    );
  });

  it("leaves a request without a string body alone", async () => {
    const inner = spyFetch();
    const init = { method: "GET" };
    await withStreamedBodies(inner)("http://sb/ready", init);

    expect(inner.mock.calls[0][1]).toBe(init);
  });

  it("sends the default transport's bodies as streams", async () => {
    const original = globalThis.fetch;
    const inner = spyFetch();
    globalThis.fetch = inner;
    try {
      await switchboardFetch("http://sb/graphql", {
        method: "POST",
        body: "{}",
      });
    } finally {
      globalThis.fetch = original;
    }

    expect(inner.mock.calls[0][1]?.body).toBeInstanceOf(ReadableStream);
  });
});
