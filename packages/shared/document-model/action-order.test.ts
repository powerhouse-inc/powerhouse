import { describe, expect, it } from "vitest";
import { createActionIdGenerator } from "./action-id.js";
import {
  compareActionIds,
  compareCanonical,
  groupedActionId,
  idOrderFor,
  legacyIdOrder,
  synthesizedActionId,
  undoGroupOfId,
  type CanonicalKey,
} from "./action-order.js";
import { capabilitiesOf } from "./base-reducer-protocol.js";
import { hashBrowser } from "./crypto.js";

describe("compareActionIds", () => {
  it("orders by code unit where a locale would not", () => {
    // Danish collation reads "aa" as å, after z.
    expect("aa".localeCompare("ab", "da")).toBe(1);
    expect(compareActionIds("aa", "ab")).toBe(-1);
    expect(compareActionIds("ab", "aa")).toBe(1);
    expect(compareActionIds("aa", "aa")).toBe(0);
  });

  it("keeps a frozen clock's ids in creation order", () => {
    const next = createActionIdGenerator({ now: () => 7 });
    const ids = Array.from({ length: 2_000 }, () => next());
    expect([...ids].reverse().sort(compareActionIds)).toEqual(ids);
  });

  it("agrees with the legacy order on lowercase UUIDs, not on uppercase or ~", () => {
    const next = createActionIdGenerator();
    for (let i = 0; i < 500; i++) {
      const a = globalThis.crypto.randomUUID();
      const b = next();
      expect(Math.sign(compareActionIds(a, b))).toBe(
        Math.sign(legacyIdOrder(a, b)),
      );
    }
    expect(compareActionIds("b", "C")).toBe(1);
    expect(legacyIdOrder("b", "C")).toBeLessThan(0);
    expect(compareActionIds("e~", "e0")).toBe(1);
    expect(legacyIdOrder("e~", "e0")).toBeLessThan(0);
  });
});

describe("idOrderFor", () => {
  it("reads the tie order from the capability table", () => {
    expect(idOrderFor(capabilitiesOf(3).tieOrder)).toBe(compareActionIds);
    expect(idOrderFor(capabilitiesOf(2).tieOrder)).toBe(legacyIdOrder);
    expect(idOrderFor(capabilitiesOf(1).tieOrder)).toBe(legacyIdOrder);
    expect(idOrderFor(undefined)).toBe(legacyIdOrder);
  });
});

describe("compareCanonical", () => {
  const at = "2021-01-01T00:00:00.000Z";
  const key = (
    actionId: string,
    timestampUtcMs = at,
    id = `op-${actionId}`,
  ): CanonicalKey => ({ id, timestampUtcMs, action: { id: actionId } });

  it("orders by timestamp, then action id, then operation id", () => {
    expect(
      compareCanonical(key("b", at), key("a", "2021-01-01T00:00:00.001Z")),
    ).toBeLessThan(0);
    expect(compareCanonical(key("a"), key("b"))).toBeLessThan(0);
    expect(compareCanonical(key("x", at, "aa"), key("x", at, "ab"))).toBe(-1);
    expect(compareCanonical(key("B"), key("a"))).toBeLessThan(0);
  });

  it("parses timestamps, so second precision is the same instant", () => {
    expect(
      compareCanonical(
        key("b", "2021-01-01T00:00:00Z"),
        key("a", "2021-01-01T00:00:00.000Z"),
      ),
    ).toBeGreaterThan(0);
  });

  it("is a total order over ties, grouped ids and mixed precision", () => {
    const next = createActionIdGenerator({ now: () => Date.parse(at) });
    const keys: CanonicalKey[] = [];
    for (let i = 0; i < 60; i++) {
      const stamp =
        i % 3 === 0
          ? "2021-01-01T00:00:00Z"
          : `2021-01-01T00:00:00.00${i % 2}Z`;
      const id = i % 4 === 0 ? groupedActionId(next(), "g") : next();
      keys.push(key(id, stamp));
    }
    const sorted = [...keys].sort(compareCanonical);
    expect([...keys].reverse().sort(compareCanonical)).toEqual(sorted);
    for (let i = 1; i < sorted.length; i++) {
      expect(compareCanonical(sorted[i - 1], sorted[i])).toBeLessThan(0);
      expect(compareCanonical(sorted[i], sorted[i - 1])).toBeGreaterThan(0);
    }
  });
});

describe("undo group ids", () => {
  it("sorts a grouped id by its leading id", () => {
    const next = createActionIdGenerator({ now: () => 7 });
    const first = groupedActionId(next(), "g1");
    const second = next();
    expect(compareActionIds(first, second)).toBe(-1);
  });

  it("parses the group from either form", () => {
    expect(undoGroupOfId(groupedActionId("id", "g1"))).toBe("g1");
    expect(undoGroupOfId("undo-group:g1:x")).toBe("g1");
    expect(undoGroupOfId("id")).toBeUndefined();
    expect(undoGroupOfId("~ug:g1")).toBeUndefined();
    expect(undoGroupOfId("id~ug:")).toBeUndefined();
    expect(undoGroupOfId("undo-group::x")).toBeUndefined();
  });
});

describe("synthesizedActionId", () => {
  it("keeps the released sha1 form byte for byte", () => {
    expect(synthesizedActionId("u", "hashed")).toBe(
      "04727b83600c6744f10a83e538916b55",
    );
    expect(
      synthesizedActionId("0192f0a4-0000-7000-8000-000000000001", "hashed"),
    ).toBe("9d5e9defc42712f65596abd0aee05ad8");
    expect(synthesizedActionId("u", "hashed")).toBe(
      hashBrowser("synthesized:u", "sha1", "hex").slice(0, 32),
    );
  });

  it("refuses where nothing synthesizes", () => {
    expect(() =>
      synthesizedActionId("u", capabilitiesOf(3).synthesizedId),
    ).toThrow("Action u cannot synthesize");
  });
});
