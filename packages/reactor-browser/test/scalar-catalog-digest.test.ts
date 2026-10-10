import { describe, expect, it } from "vitest";
import { SCALAR_CATALOG_INVENTORY as GOLDEN } from "../../document-model/test/definition/goldens/scalar-catalog-inventory.js";
import { scalarInventory } from "../../document-model/test/definition/scalar-inventory.js";

/**
 * Checks the scalar catalog inventory in a browser.
 * `packages/document-model/test/definition/scalar-inventory.test.ts` runs the
 * same check in Node against the same committed golden. Definition checks,
 * package revisions, and replay comparisons key on the catalog digest, so a
 * browser and a server must compute the same one. Running in Chromium also
 * shows the construction uses no Node-only API such as `node:crypto` or
 * `Buffer`.
 */
describe("the scalar catalog inventory", () => {
  it("reproduces the committed digests in a browser", () => {
    expect(scalarInventory()).toStrictEqual(GOLDEN);
  });
});
