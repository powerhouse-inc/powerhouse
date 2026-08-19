import { describe, expect, it } from "vitest";
import type { Action } from "./actions.js";
import { toTransportAction } from "./action-transport.js";
import type { Signature } from "./signatures.js";

const signature: Signature = ["ts", "key", "hash", "prev", "0xsig"];

const action: Action = {
  id: "act-1",
  type: "SET_NAME",
  timestampUtcMs: "2026-01-01T00:00:00.000Z",
  input: { name: "x" },
  scope: "global",
};

describe("projecting an action onto the shape the wire declares", () => {
  it("carries the fields an action always has", () => {
    expect(toTransportAction(action)).toEqual({
      id: "act-1",
      type: "SET_NAME",
      timestampUtcMs: "2026-01-01T00:00:00.000Z",
      input: { name: "x" },
      scope: "global",
    });
  });

  it("sends no context at all when the action has none", () => {
    // Rather than a context full of nulls, which reads as a caller asserting
    // there was no previous operation.
    expect(toTransportAction(action)).not.toHaveProperty("context");
  });

  it("carries the head the action was stamped against", () => {
    const stamped: Action = {
      ...action,
      context: { prevOpHash: "deadbeef", prevOpIndex: 3 },
    };

    expect(toTransportAction(stamped).context).toEqual({
      prevOpHash: "deadbeef",
      prevOpIndex: 3,
    });
  });

  it("keeps a prevOpIndex of -1, which an empty scope stamps", () => {
    const stamped: Action = { ...action, context: { prevOpIndex: -1 } };

    expect(toTransportAction(stamped).context).toEqual({ prevOpIndex: -1 });
  });

  it("joins each signature for transport", () => {
    const signed: Action = {
      ...action,
      context: {
        signer: {
          user: { address: "0x1", networkId: "eip155", chainId: 1 },
          app: { name: "Connect", key: "did:key:z6Mk" },
          signatures: [signature],
        },
      },
    };

    expect(toTransportAction(signed).context?.signer?.signatures).toEqual([
      "ts, key, hash, prev, 0xsig",
    ]);
  });

  it("drops a field the wire does not declare", () => {
    // The guarantee this projection exists for: an action read back out of
    // storage can carry a legacy field, and an input object refuses the whole
    // request over one it does not declare.
    const stale = {
      ...action,
      attachments: [{ hash: "h" }],
      index: 4,
      hash: "operation-hash",
      resultingState: "{}",
    } as unknown as Action;

    expect(toTransportAction(stale)).toEqual({
      id: "act-1",
      type: "SET_NAME",
      timestampUtcMs: "2026-01-01T00:00:00.000Z",
      input: { name: "x" },
      scope: "global",
    });
  });

  it("drops a context field the wire does not declare", () => {
    const stale = {
      ...action,
      context: { prevOpHash: "deadbeef", resultingState: "{}" },
    } as unknown as Action;

    expect(toTransportAction(stale).context).toEqual({
      prevOpHash: "deadbeef",
    });
  });
});
