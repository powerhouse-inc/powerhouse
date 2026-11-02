import { describe, expect, it, vi } from "vitest";
import {
  isNodeFetch,
  switchboardFetch,
  type GraphQLFetch,
} from "../../src/graphql-client/transport.js";

describe("the Switchboard transport in a browser", () => {
  it("is not Node's fetch", () => {
    expect(isNodeFetch()).toBe(false);
  });

  it("keeps a string body buffered: Chrome streams uploads only over HTTP/2", async () => {
    const original = globalThis.fetch;
    const inner = vi.fn<GraphQLFetch>(() =>
      Promise.resolve(new Response("{}")),
    );
    globalThis.fetch = inner;
    try {
      await switchboardFetch("http://sb/graphql", {
        method: "POST",
        body: "{}",
      });
    } finally {
      globalThis.fetch = original;
    }

    expect(inner.mock.calls[0][1]?.body).toBe("{}");
  });
});
