import { describe, expect, it } from "vitest";

import type { DataSnapshot } from "../../src/definition/data-properties.js";
import {
  snapshotDataArray,
  snapshotDataRecord,
  snapshotRecord,
} from "../../src/definition/data-properties.js";

function accepted<T>(snapshot: DataSnapshot<T>): T {
  if (!snapshot.ok) {
    throw new Error(
      `rejected with ${snapshot.reason} at ${JSON.stringify(snapshot.path)}`,
    );
  }
  return snapshot.value;
}

function containers(value: unknown, found: object[] = []): object[] {
  if (typeof value === "object" && value !== null) {
    found.push(value);
    const members: unknown[] = Object.values(value);
    for (const member of members) {
      containers(member, found);
    }
  }
  return found;
}

describe("snapshotDataRecord", () => {
  it("copies the literal so later mutation does not reach the snapshot", () => {
    const source: {
      name: string;
      nested: { count: number };
      list: number[];
      extra?: boolean;
    } = { name: "a", nested: { count: 1 }, list: [1, 2] };
    const snapshot = snapshotDataRecord(source, ["name", "nested", "list"], []);
    source.extra = true;
    source.nested.count = 2;
    source.list.push(3);
    expect(snapshot).toStrictEqual({
      ok: true,
      value: { name: "a", nested: { count: 1 }, list: [1, 2] },
    });
  });

  it("freezes the result and every nested object and array, never the source", () => {
    const source = { nested: { list: [{ deep: [1] }] } };
    const value = accepted(snapshotDataRecord(source, ["nested"], []));
    const copies = containers(value);
    expect(copies).toHaveLength(5);
    expect(copies.every((container) => Object.isFrozen(container))).toBe(true);
    expect(
      containers(source).some((container) => Object.isFrozen(container)),
    ).toBe(false);
  });

  it("keeps string keys in insertion order", () => {
    const value = accepted(
      snapshotDataRecord(
        { zeta: 1, alpha: 2, mid: 3 },
        ["zeta", "alpha", "mid"],
        [],
      ),
    );
    expect(Object.keys(value)).toStrictEqual(["zeta", "alpha", "mid"]);
  });

  it("keeps the engine's own-key order, integer-like keys first then insertion order", () => {
    const value = accepted(
      snapshotDataRecord(
        { b: 1, "1": 2, a: 3, "02": 4 },
        ["b", "1", "a", "02"],
        [],
      ),
    );
    expect(Object.keys(value)).toStrictEqual(["1", "b", "a", "02"]);
  });

  it("keeps bigint, undefined, null, and boolean leaves as is", () => {
    const value = accepted(
      snapshotDataRecord(
        { big: 10n, missing: undefined, none: null, flag: false },
        ["big", "missing", "none", "flag"],
        [],
      ),
    );
    expect(value).toStrictEqual({
      big: 10n,
      missing: undefined,
      none: null,
      flag: false,
    });
    expect(Object.keys(value)).toStrictEqual([
      "big",
      "missing",
      "none",
      "flag",
    ]);
  });

  it("does not check nested objects against allowedKeys", () => {
    const value = accepted(
      snapshotDataRecord({ nested: { anything: 1 } }, ["nested"], []),
    );
    expect(value).toStrictEqual({ nested: { anything: 1 } });
  });

  it("rejects cycles at the path that closes them", () => {
    const source: Record<string, unknown> = {};
    source.self = source;

    expect(snapshotDataRecord(source, ["self"], ["opts"])).toStrictEqual({
      ok: false,
      reason: "cycle",
      path: ["opts", "self"],
    });
  });

  it("allows a shared value when it is not an ancestor", () => {
    const shared = { value: 1 };
    expect(
      snapshotDataRecord(
        { first: shared, second: shared },
        ["first", "second"],
        [],
      ),
    ).toStrictEqual({
      ok: true,
      value: { first: { value: 1 }, second: { value: 1 } },
    });
  });

  it("keeps an own __proto__ key as an own key", () => {
    const source: unknown = {};
    Object.defineProperty(source, "__proto__", {
      value: 1,
      enumerable: true,
      writable: true,
      configurable: true,
    });
    const value = accepted(snapshotDataRecord(source, ["__proto__"], []));
    expect(Object.hasOwn(value, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(value) === Object.prototype).toBe(true);
    expect(value["__proto__"]).toBe(1);
  });

  it("accepts a null-prototype object", () => {
    const bare: unknown = Object.create(null);
    Object.defineProperty(bare, "a", {
      value: 1,
      enumerable: true,
      writable: true,
      configurable: true,
    });
    expect(snapshotDataRecord(bare, ["a"], [])).toStrictEqual({
      ok: true,
      value: { a: 1 },
    });
  });

  it("rejects non-objects with not-record at the input path", () => {
    for (const value of [null, undefined, "text", 1, () => true]) {
      expect(snapshotDataRecord(value, [], ["opts"])).toStrictEqual({
        ok: false,
        reason: "not-record",
        path: ["opts"],
      });
    }
  });

  it("rejects Map, Date, and class instances with custom-prototype", () => {
    class Options {
      readonly a = 1;
    }
    for (const value of [
      new Map<string, number>(),
      new Date(0),
      new Options(),
    ]) {
      expect(snapshotDataRecord(value, ["a"], ["opts"])).toStrictEqual({
        ok: false,
        reason: "custom-prototype",
        path: ["opts"],
      });
    }
    expect(
      snapshotDataRecord({ when: new Date(0) }, ["when"], ["opts"]),
    ).toStrictEqual({
      ok: false,
      reason: "custom-prototype",
      path: ["opts", "when"],
    });
  });

  it("rejects a symbol key, naming the key and the owning path", () => {
    const tag = Symbol("tag");
    expect(snapshotDataRecord({ [tag]: 1 }, [], ["opts"])).toStrictEqual({
      ok: false,
      reason: "symbol-key",
      path: ["opts"],
      key: tag,
    });
    expect(
      snapshotDataRecord({ nested: { [tag]: 1 } }, ["nested"], ["opts"]),
    ).toStrictEqual({
      ok: false,
      reason: "symbol-key",
      path: ["opts", "nested"],
      key: tag,
    });
  });

  it("rejects an unknown key before inspecting its value", () => {
    let invoked = false;
    const source = { name: "x" };
    Object.defineProperty(source, "colour", {
      enumerable: true,
      get() {
        invoked = true;
        return "red";
      },
    });
    expect(
      snapshotDataRecord(source, ["name", "color"], ["field", "options"]),
    ).toStrictEqual({
      ok: false,
      reason: "unknown-key",
      path: ["field", "options", "colour"],
      key: "colour",
      allowedKeys: ["name", "color"],
    });
    expect(invoked).toBe(false);
  });

  it("rejects a getter without invoking it", () => {
    let invoked = false;
    const source = {
      get secret() {
        invoked = true;
        return 1;
      },
    };
    expect(snapshotDataRecord(source, ["secret"], ["opts"])).toStrictEqual({
      ok: false,
      reason: "accessor",
      path: ["opts", "secret"],
      key: "secret",
    });
    expect(invoked).toBe(false);
  });

  it("rejects a setter-only property as an accessor", () => {
    let sink = 0;
    const source = {
      set secret(value: number) {
        sink = value;
      },
    };
    expect(snapshotDataRecord(source, ["secret"], ["opts"])).toStrictEqual({
      ok: false,
      reason: "accessor",
      path: ["opts", "secret"],
      key: "secret",
    });
    expect(sink).toBe(0);
  });

  it("rejects a non-enumerable data property", () => {
    const source = { name: "x" };
    Object.defineProperty(source, "hidden", { value: 1, enumerable: false });
    expect(
      snapshotDataRecord(source, ["name", "hidden"], ["opts"]),
    ).toStrictEqual({
      ok: false,
      reason: "non-enumerable",
      path: ["opts", "hidden"],
      key: "hidden",
    });
  });

  it("rejects functions and symbols inside data with not-data at their path", () => {
    expect(
      snapshotDataRecord({ nested: { run: () => true } }, ["nested"], ["opts"]),
    ).toStrictEqual({
      ok: false,
      reason: "not-data",
      path: ["opts", "nested", "run"],
    });
    expect(
      snapshotDataRecord({ tag: Symbol("tag") }, ["tag"], ["opts"]),
    ).toStrictEqual({ ok: false, reason: "not-data", path: ["opts", "tag"] });
  });

  it("reports a throwing proxy trap as inspection-failed", () => {
    const hostile = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("trap");
        },
      },
    );
    expect(snapshotDataRecord(hostile, [], ["opts"])).toStrictEqual({
      ok: false,
      reason: "inspection-failed",
      path: ["opts"],
    });
    expect(
      snapshotDataRecord({ inner: hostile }, ["inner"], ["opts"]),
    ).toStrictEqual({
      ok: false,
      reason: "inspection-failed",
      path: ["opts", "inner"],
    });
  });
});

describe("revoked proxies", () => {
  it("are reported as inspection-failed by both snapshot entry points", () => {
    const record = Proxy.revocable({}, {});
    record.revoke();
    expect(snapshotDataRecord(record.proxy, [], ["opts"])).toStrictEqual({
      ok: false,
      reason: "inspection-failed",
      path: ["opts"],
    });
    const list = Proxy.revocable([], {});
    list.revoke();
    expect(snapshotDataArray(list.proxy, ["list"])).toStrictEqual({
      ok: false,
      reason: "inspection-failed",
      path: ["list"],
    });
    expect(
      snapshotDataRecord({ inner: list.proxy }, ["inner"], ["opts"]),
    ).toStrictEqual({
      ok: false,
      reason: "inspection-failed",
      path: ["opts", "inner"],
    });
  });
});

describe("snapshotDataArray", () => {
  it("copies and deep-freezes a dense array without freezing the source", () => {
    const inner = { a: [1] };
    const source: unknown[] = [inner, 2];
    const snapshot = snapshotDataArray(source, ["list"]);
    source.push(3);
    inner.a.push(9);
    expect(snapshot).toStrictEqual({ ok: true, value: [{ a: [1] }, 2] });
    const copies = containers(accepted(snapshot));
    expect(copies).toHaveLength(3);
    expect(copies.every((container) => Object.isFrozen(container))).toBe(true);
    expect(Object.isFrozen(source)).toBe(false);
    expect(Object.isFrozen(inner)).toBe(false);
  });

  it("rejects a symbol property with symbol-key", () => {
    const tag = Symbol("tag");
    const list = [1];
    Object.defineProperty(list, tag, { value: 1, enumerable: true });
    expect(snapshotDataArray(list, ["list"])).toStrictEqual({
      ok: false,
      reason: "symbol-key",
      path: ["list"],
      key: tag,
    });
  });

  it("rejects a hole with sparse at the missing index", () => {
    const holes = new Array<number>(3);
    holes[0] = 1;
    holes[2] = 3;
    expect(snapshotDataArray(holes, ["list"])).toStrictEqual({
      ok: false,
      reason: "sparse",
      path: ["list", 1],
      key: 1,
    });
  });

  it("rejects cycles at the path that closes them", () => {
    const list: unknown[] = [];
    list.push(list);

    expect(snapshotDataArray(list, ["list"])).toStrictEqual({
      ok: false,
      reason: "cycle",
      path: ["list", 0],
    });
  });

  it("rejects arrays with a custom prototype", () => {
    class CustomArray extends Array<number> {}
    const list = new CustomArray();
    list.push(1);

    expect(snapshotDataArray(list, ["list"])).toStrictEqual({
      ok: false,
      reason: "custom-prototype",
      path: ["list"],
    });
    expect(snapshotDataRecord({ list }, ["list"], ["opts"])).toStrictEqual({
      ok: false,
      reason: "custom-prototype",
      path: ["opts", "list"],
    });
  });

  it("rejects a custom property with array-property carrying the key", () => {
    const list: number[] & { origin?: string } = [1, 2];
    list.origin = "test";
    expect(snapshotDataArray(list, ["list"])).toStrictEqual({
      ok: false,
      reason: "array-property",
      path: ["list", "origin"],
      key: "origin",
    });
  });

  it("rejects an accessor index without invoking it", () => {
    let invoked = false;
    const list = [0];
    Object.defineProperty(list, 0, {
      get() {
        invoked = true;
        return 1;
      },
    });
    expect(snapshotDataArray(list, ["list"])).toStrictEqual({
      ok: false,
      reason: "accessor",
      path: ["list", 0],
      key: 0,
    });
    expect(invoked).toBe(false);
  });

  it("rejects array-likes and non-array iterables with not-array", () => {
    expect(snapshotDataArray({ length: 1, 0: "a" }, ["list"])).toStrictEqual({
      ok: false,
      reason: "not-array",
      path: ["list"],
    });
    expect(snapshotDataArray(new Set([1]), ["list"])).toStrictEqual({
      ok: false,
      reason: "not-array",
      path: ["list"],
    });
  });

  it("rejects a function element with not-data at its index", () => {
    expect(snapshotDataArray([1, () => true], ["list"])).toStrictEqual({
      ok: false,
      reason: "not-data",
      path: ["list", 1],
    });
  });

  it("reports a throwing proxy trap as inspection-failed", () => {
    const hostile = new Proxy([], {
      ownKeys() {
        throw new Error("trap");
      },
    });
    expect(snapshotDataArray(hostile, ["list"])).toStrictEqual({
      ok: false,
      reason: "inspection-failed",
      path: ["list"],
    });
  });
});

describe("snapshotRecord", () => {
  it("keeps member values by reference and freezes only the record", () => {
    const descriptor = { kind: "field", type: "String" };
    const validate = (value: unknown) => value !== null;
    const nested = { deep: [1] };
    const source = { descriptor, validate, nested };
    const value = accepted(
      snapshotRecord(source, ["descriptor", "validate", "nested"], []),
    );
    expect(value.descriptor).toBe(descriptor);
    expect(value.validate).toBe(validate);
    expect(value.nested).toBe(nested);
    expect(Object.keys(value)).toStrictEqual([
      "descriptor",
      "validate",
      "nested",
    ]);
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(source)).toBe(false);
    expect(Object.isFrozen(nested)).toBe(false);
    expect(Object.isFrozen(descriptor)).toBe(false);
  });

  it("applies the same top-level checks as the data variant", () => {
    const tag = Symbol("tag");
    let invoked = false;
    const withGetter = {
      get secret() {
        invoked = true;
        return 1;
      },
    };
    expect(snapshotRecord({ [tag]: 1 }, [], ["opts"])).toStrictEqual({
      ok: false,
      reason: "symbol-key",
      path: ["opts"],
      key: tag,
    });
    expect(snapshotRecord({ extra: 1 }, ["name"], ["opts"])).toStrictEqual({
      ok: false,
      reason: "unknown-key",
      path: ["opts", "extra"],
      key: "extra",
      allowedKeys: ["name"],
    });
    expect(snapshotRecord(withGetter, ["secret"], ["opts"])).toStrictEqual({
      ok: false,
      reason: "accessor",
      path: ["opts", "secret"],
      key: "secret",
    });
    expect(invoked).toBe(false);
    expect(snapshotRecord(new Date(0), [], ["opts"])).toStrictEqual({
      ok: false,
      reason: "custom-prototype",
      path: ["opts"],
    });
  });
});
