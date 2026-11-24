// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { stored, type StoredScope } from "../src/lib/stored.js";
import { clearStorage } from "./storage.fixture.js";

let keys = 0;
function value(scope: StoredScope) {
  const key = `test-${++keys}`;
  return {
    name: `ph-devtools:${key}`,
    value: stored<number>({
      key,
      scope,
      fallback: 0,
      parse: (json) => (typeof json === "number" ? json : undefined),
    }),
  };
}

/** What another tab's write looks like here: the storage changes, then the
 * event fires. */
function writeFromAnotherTab(name: string, raw: string) {
  localStorage.setItem(name, raw);
  window.dispatchEvent(new StorageEvent("storage", { key: name }));
}

beforeEach(clearStorage);

describe("a stored value", () => {
  it("is the fallback until it is set, then what was set", () => {
    const { name, value: count } = value("preference");
    expect(count.get()).toBe(0);
    count.set(3);
    expect(count.get()).toBe(3);
    expect(localStorage.getItem(name)).toBe("3");
  });

  it("is the fallback for what does not parse", () => {
    const { name, value: count } = value("preference");
    for (const raw of ["{", '"three"', "null"]) {
      localStorage.setItem(name, raw);
      expect(count.get()).toBe(0);
    }
  });

  it("returns the same snapshot while the saved value stays put", () => {
    const fruit = stored<{ name: string }>({
      key: "fruit",
      scope: "preference",
      fallback: { name: "none" },
      parse: (json) => json as { name: string },
    });
    fruit.set({ name: "pear" });
    expect(fruit.get()).toBe(fruit.get());
  });

  it("tells its subscribers in this page when it is set", () => {
    const { value: count } = value("preference");
    const onChange = vi.fn();
    const unsubscribe = count.subscribe(onChange);
    count.set(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    unsubscribe();
    count.set(2);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("keeps working in memory where storage throws", () => {
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new DOMException("Blocked", "SecurityError");
      });
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("Full", "QuotaExceededError");
      });
    try {
      const { value: count } = value("tab");
      expect(count.get()).toBe(0);
      expect(() => count.set(4)).not.toThrow();
      expect(count.get()).toBe(4);
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });
});

describe("a preference", () => {
  it("follows what another tab sets", () => {
    const { name, value: count } = value("preference");
    const onChange = vi.fn();
    count.subscribe(onChange);

    writeFromAnotherTab(name, "7");

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(count.get()).toBe(7);
  });
});

describe("a tab's value", () => {
  it("is kept per tab, with the last value set in any tab as the next tab's start", () => {
    const { name, value: count } = value("tab");
    count.set(5);
    expect(sessionStorage.getItem(name)).toBe("5");
    expect(localStorage.getItem(name)).toBe("5");
  });

  it("starts from the last value set in any tab, then ignores the others", () => {
    const { name, value: count } = value("tab");
    localStorage.setItem(name, "8");
    const onChange = vi.fn();
    count.subscribe(onChange);

    expect(count.get()).toBe(8);
    writeFromAnotherTab(name, "9");

    expect(count.get()).toBe(8);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps the last value set in any tab as its own where it cannot save one", () => {
    const { name, value: count } = value("tab");
    localStorage.setItem(name, "8");
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("Full", "QuotaExceededError");
      });
    try {
      expect(count.get()).toBe(8);
    } finally {
      setItem.mockRestore();
    }
    localStorage.setItem(name, "9");
    expect(count.get()).toBe(8);
  });

  it("keeps its own value over the last one set in another tab", () => {
    const { name, value: count } = value("tab");
    sessionStorage.setItem(name, "1");
    localStorage.setItem(name, "2");
    expect(count.get()).toBe(1);
  });
});
