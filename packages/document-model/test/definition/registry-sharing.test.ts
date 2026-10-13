import { describe, expect, it } from "vitest";
import type * as DescriptorRegistry from "../../src/definition/descriptor-registry.js";
import { ph } from "../../src/definition/field.js";

/**
 * One process, two copies of this compiler.
 *
 * That is the ordinary case for a code-first subgraph, not an exotic one: the
 * package bundles its own copy of `ph`, and `defineSubgraph` arrives from the
 * host, which is deliberately never bundled so that the class identity its
 * loader checks stays single. Whether a value is a descriptor, and what a
 * `ph.ref` points at, are answered by object identity — so the copy doing the
 * compiling has to be able to read what the copy doing the authoring recorded.
 * When it cannot, a subgraph publishes an empty schema and the failure reaches
 * a running host rather than the check.
 *
 * The second copy here is a genuinely separate module instance of the
 * registry, reached through a distinct specifier; the first test says so, and
 * the rest mean nothing without it.
 */
type Registry = typeof DescriptorRegistry;

// Built at run time: a query suffix is what makes the module resolver hand
// back a second instance, and `tsc` cannot resolve a specifier carrying one.
const SECOND_COPY = `../../src/definition/descriptor-registry.js${"?second-copy"}`;

async function secondRegistry(): Promise<Registry> {
  return (await import(SECOND_COPY)) as Registry;
}

describe("a descriptor crossing two copies of the compiler", () => {
  it("is read through a separate module instance", async () => {
    const other = await secondRegistry();
    const here = await import("../../src/definition/descriptor-registry.js");
    expect(other.isTypeDescriptor).not.toBe(here.isTypeDescriptor);
  });

  it("is still recognised as a descriptor by the other copy", async () => {
    const other = await secondRegistry();
    const item = ph.object("SharedItem", {
      fields: { id: ph.OID({ required: true }) },
    });
    expect(other.isTypeDescriptor(item)).toBe(true);
    expect(other.isFieldDescriptor(ph.String())).toBe(true);
    expect(other.isScalarFactory(ph.OID)).toBe(true);
  });

  it("resolves a ph.ref the other copy created", async () => {
    const other = await secondRegistry();
    const item = ph.object("ReferencedItem", { fields: { id: ph.String() } });
    expect(other.referenceResolver(ph.ref(item))?.()).toBe(item);
  });
});
