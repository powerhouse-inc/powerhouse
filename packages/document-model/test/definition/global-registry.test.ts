import { describe, expect, it } from "vitest";
import type * as GlobalRegistry from "../../src/definition/global-registry.js";
import { getGlobalRegistry } from "../../src/definition/global-registry.js";

const SECOND_COPY = `../../src/definition/global-registry.js${"?second-copy"}`;

describe("global registries", () => {
  it("shares entries across independent helper loads", async () => {
    const other = (await import(SECOND_COPY)) as typeof GlobalRegistry;
    const key = "powerhouse.document-model.test.registry-sharing";
    try {
      expect(other.getGlobalRegistry).not.toBe(getGlobalRegistry);
      const registry = getGlobalRegistry(key, () => new Map<string, string>());
      registry.set("origin", "first copy");
      const shared = other.getGlobalRegistry(
        key,
        () => new Map<string, string>(),
      );

      expect(shared).toBe(registry);
      expect([...shared]).toEqual([["origin", "first copy"]]);
      shared.set("reader", "second copy");
      expect([...registry]).toEqual([
        ["origin", "first copy"],
        ["reader", "second copy"],
      ]);
    } finally {
      Reflect.deleteProperty(globalThis, Symbol.for(key));
    }
  });

  it("uses a registry pre-seeded under an existing package key", () => {
    const key = "powerhouse.document-model.compilation-reports";
    const symbol = Symbol.for(key);
    const previous = Object.getOwnPropertyDescriptor(globalThis, symbol);
    const module = {};
    const registry = new WeakMap([
      [module, { diagnostics: ["from older copy"] }],
    ]);
    Reflect.set(globalThis, symbol, registry);
    try {
      const shared = getGlobalRegistry<typeof registry>(key, () => {
        throw new Error("must reuse the existing registry");
      });

      expect(shared).toBe(registry);
      expect(shared.get(module)).toEqual({ diagnostics: ["from older copy"] });
    } finally {
      if (previous) Object.defineProperty(globalThis, symbol, previous);
      else Reflect.deleteProperty(globalThis, symbol);
    }
  });
});
