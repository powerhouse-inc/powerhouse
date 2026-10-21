import { describe, expect, it } from "vitest";
import { SCALAR_CATALOG_INVENTORY as GOLDEN } from "./goldens/scalar-catalog-inventory.js";
import { scalarInventory } from "./scalar-inventory.js";

/**
 * The catalog's constructed metadata reproduces the committed inventory.
 *
 * A digest is only an identity if two people computing it get the same
 * number. This is the Node half; `packages/reactor-browser` checks the same
 * bytes from a real browser, because a catalog whose digest depended on the
 * runtime would make every artifact keyed by it — a definition check, a
 * package revision, a replay comparison — disagree across the two.
 *
 * Regenerate with
 * `pnpm exec tsx --conditions=source test/definition/regenerate-scalar-inventory.ts`.
 */
describe("the scalar catalog inventory", () => {
  it("reproduces the committed digests under Node", () => {
    expect(scalarInventory()).toStrictEqual(GOLDEN);
  });

  it("names every entry it digests, once, in declared order", () => {
    const inventory = scalarInventory();
    expect(inventory.entries.map((entry) => entry.name)).toStrictEqual(
      inventory.names,
    );
    expect(new Set(inventory.names).size).toBe(inventory.names.length);
    expect(inventory.diagnostics).toStrictEqual([]);
    for (const entry of inventory.entries) {
      expect(entry.validationProfile, entry.name).toBe(
        "document-engineering-1.40",
      );
      expect(entry.definitionDigest, entry.name).toMatch(
        /^sha256:[0-9a-f]{64}$/,
      );
    }
  });
});
