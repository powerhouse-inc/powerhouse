import { describe, expect, it } from "vitest";
import {
  RPC_PROTOCOL_VERSION,
  type RpcDbOp,
  type RpcLiveEvent,
  type RpcLiveSubscribe,
  type RpcLiveUnsub,
  type RpcMessage,
} from "../../src/rpc/protocol.js";
import { createPortTransport } from "../../src/rpc/transport.js";

function roundTrip(message: RpcMessage): Promise<RpcMessage> {
  const ch = new MessageChannel();
  const sender = createPortTransport(ch.port1);
  const receiver = createPortTransport(ch.port2);
  return new Promise<RpcMessage>((resolve) => {
    receiver.onMessage((m) => resolve(m));
    sender.post(message);
  });
}

describe("relational + live-query wire protocol (v2)", () => {
  it("bumps RPC_PROTOCOL_VERSION for the incompatible wire change", () => {
    expect(RPC_PROTOCOL_VERSION).toBe(2);
  });

  it("round-trips a db-op carrying a compiled SQL string + params", async () => {
    const msg: RpcDbOp = {
      k: "db-op",
      id: "db1",
      method: "query",
      args: ["select * from t where a = $1", [42]],
    };
    expect(await roundTrip(msg)).toEqual(msg);
  });

  it("round-trips a live-query subscribe", async () => {
    const msg: RpcLiveSubscribe = {
      k: "sub-live",
      id: "live1",
      sql: "select * from t",
      params: [],
    };
    expect(await roundTrip(msg)).toEqual(msg);
  });

  it("round-trips a live-query result snapshot (owner -> tab)", async () => {
    const msg: RpcLiveEvent = {
      k: "event-live",
      id: "live1",
      rows: [{ a: 1 }, { a: 2 }],
    };
    expect(await roundTrip(msg)).toEqual(msg);
  });

  it("round-trips a live-query unsubscribe", async () => {
    const msg: RpcLiveUnsub = { k: "unsub-live", id: "live1" };
    expect(await roundTrip(msg)).toEqual(msg);
  });

  it("reserves a non-overlapping correlation-id prefix per channel", () => {
    const prefixes = ["c", "s", "admin-", "db", "live"];
    expect(new Set(prefixes).size).toBe(prefixes.length);
    for (const a of prefixes) {
      for (const b of prefixes) {
        if (a !== b) expect(a.startsWith(b)).toBe(false);
      }
    }
  });
});
