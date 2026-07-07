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

// Wire a correlator to a transport the way the router does: post via the
// transport, route res/err into handleMessage.
function correlatorOn(transport: IRpcTransport, prefix = "r") {
  const correlator = new RpcCorrelator(transport, prefix);
  transport.onMessage((m) => correlator.handleMessage(m as OwnerMessage));
  return correlator;
}

function lastId(posted: ClientMessage[]): string {
  const m = posted.at(-1);
  if (!m || !("id" in m)) throw new Error("no id-bearing message posted");
  return m.id;
}

describe("RpcCorrelator", () => {
  it("resolves a request on res, applying a per-request transform", async () => {
    const { transport, posted, deliver } = createFakeTransport();
    const correlator = correlatorOn(transport);

    const promise = correlator.request(
      (id) => ({ k: "req", id, method: "get", args: [] }),
      { transform: (v) => ({ wrapped: v }) },
    );
    deliver({ k: "res", id: lastId(posted), value: 42 });

    expect(await promise).toEqual({ wrapped: 42 });
  });

  it("rejects a request on err", async () => {
    const { transport, posted, deliver } = createFakeTransport();
    const correlator = correlatorOn(transport);

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
    const correlator = new RpcCorrelator(transport, "insp");
    expect(correlator.nextId()).toBe("insp1");
    expect(correlator.nextId()).toBe("insp2");
  });

  it("ignores a res/err for an id it did not issue", () => {
    const { transport } = createFakeTransport();
    const correlator = new RpcCorrelator(transport, "r");
    expect(() =>
      correlator.handleMessage({
        k: "err",
        id: "other9",
        error: { name: "E", message: "x" },
      }),
    ).not.toThrow();
  });

  it("times out only when timeoutMs is set (per request)", async () => {
    vi.useFakeTimers();
    try {
      const { transport } = createFakeTransport();
      const correlator = correlatorOn(transport, "s");

      const timed = correlator.request(
        (id) => ({ k: "sync-op", id, method: "list", args: [] }),
        { timeoutMs: 30000 },
      );
      const rejected = expect(timed).rejects.toThrow(
        /did not respond to sync-op "list"/,
      );
      vi.advanceTimersByTime(30000);
      await rejected;

      // No timeoutMs: stays pending past the same interval.
      let settled = false;
      void correlator
        .request((id) => ({ k: "req", id, method: "get", args: [] }))
        .finally(() => {
          settled = true;
        });
      vi.advanceTimersByTime(60000);
      await Promise.resolve();
      expect(settled).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("runs the per-request cleanup on settle", async () => {
    const { transport, posted, deliver } = createFakeTransport();
    const correlator = correlatorOn(transport);

    const cleanup = vi.fn();
    const promise = correlator.request(
      (id) => ({ k: "req", id, method: "get", args: [] }),
      { setup: () => cleanup },
    );
    expect(cleanup).not.toHaveBeenCalled();
    deliver({ k: "res", id: lastId(posted), value: 1 });
    await promise;
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});
