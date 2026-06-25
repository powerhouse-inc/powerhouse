import { describe, expect, it, vi } from "vitest";
import type {
  ClientMessage,
  OwnerMessage,
  RpcMessage,
} from "../../src/rpc/protocol.js";
import { RpcCorrelator } from "../../src/rpc/rpc-correlator.js";
import type { IRpcTransport } from "../../src/rpc/transport.js";

function createFakeTransport() {
  const listeners = new Set<(m: RpcMessage) => void>();
  const posted: ClientMessage[] = [];
  const transport: IRpcTransport = {
    post: (m) => {
      posted.push(m as ClientMessage);
    },
    onMessage: (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    close: () => {},
  };
  const deliver = (m: OwnerMessage) => {
    for (const l of [...listeners]) l(m);
  };
  return { transport, posted, deliver };
}

function lastId(posted: ClientMessage[]): string {
  const m = posted.at(-1);
  if (!m || !("id" in m)) throw new Error("no id-bearing message posted");
  return m.id;
}

describe("RpcCorrelator", () => {
  it("resolves a request on res, applying the transform", async () => {
    const { transport, posted, deliver } = createFakeTransport();
    const correlator = new RpcCorrelator(transport, {
      prefix: "c",
      transform: (v) => ({ wrapped: v }),
    });
    correlator.attach();

    const promise = correlator.request((id) => ({
      k: "req",
      id,
      method: "get",
      args: [],
    }));
    deliver({ k: "res", id: lastId(posted), value: 42 });

    expect(await promise).toEqual({ wrapped: 42 });
  });

  it("rejects a request on err", async () => {
    const { transport, posted, deliver } = createFakeTransport();
    const correlator = new RpcCorrelator(transport, { prefix: "c" });
    correlator.attach();

    const promise = correlator.request((id) => ({
      k: "req",
      id,
      method: "get",
      args: [],
    }));
    deliver({
      k: "err",
      id: lastId(posted),
      error: { name: "Error", message: "boom" },
    });

    await expect(promise).rejects.toThrow("boom");
  });

  it("issues prefixed, incrementing ids", () => {
    const { transport } = createFakeTransport();
    const correlator = new RpcCorrelator(transport, { prefix: "insp" });
    expect(correlator.nextId()).toBe("insp1");
    expect(correlator.nextId()).toBe("insp2");
  });

  it("handleMessage returns false for unowned ids and non-res/err kinds", () => {
    const { transport } = createFakeTransport();
    const correlator = new RpcCorrelator(transport, { prefix: "c" });
    // unknown id
    expect(
      correlator.handleMessage({
        k: "err",
        id: "other9",
        error: { name: "E", message: "x" },
      }),
    ).toBe(false);
    // not a res/err — lets a shared listener fall through to other consumers
    expect(
      correlator.handleMessage({
        k: "event",
        id: "c1",
        change: {},
      } as OwnerMessage),
    ).toBe(false);
  });

  it("times out only when timeoutMs is set", async () => {
    vi.useFakeTimers();
    try {
      const { transport, posted } = createFakeTransport();
      const withTimeout = new RpcCorrelator(transport, {
        prefix: "s",
        timeoutMs: 30000,
        label: "sync-op",
      });
      const timed = withTimeout.request((id) => ({
        k: "sync-op",
        id,
        method: "list",
        args: [],
      }));
      const rejected = expect(timed).rejects.toThrow(
        /did not respond to sync-op/,
      );
      vi.advanceTimersByTime(30000);
      await rejected;

      // No timeoutMs: the request stays pending past the same interval.
      const noTimeout = new RpcCorrelator(transport, { prefix: "c" });
      let settled = false;
      void noTimeout
        .request((id) => ({ k: "req", id, method: "get", args: [] }))
        .finally(() => {
          settled = true;
        });
      vi.advanceTimersByTime(60000);
      await Promise.resolve();
      expect(settled).toBe(false);
      expect(posted.length).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("runs the per-request cleanup on settle", async () => {
    const { transport, posted, deliver } = createFakeTransport();
    const correlator = new RpcCorrelator(transport, { prefix: "c" });
    correlator.attach();

    const cleanup = vi.fn();
    const promise = correlator.request(
      (id) => ({ k: "req", id, method: "get", args: [] }),
      () => cleanup,
    );
    expect(cleanup).not.toHaveBeenCalled();
    deliver({ k: "res", id: lastId(posted), value: 1 });
    await promise;
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
