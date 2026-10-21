import { describe, expect, it } from "vitest";
import {
  CODE_FIRST_AUTHORING,
  inspectableDefinition,
} from "../../src/definition/module-inspection.js";
import { buildScalarsModel } from "./scalars-model.js";

/**
 * A host can tell a compiled definition from anything else, and says so in
 * data a worker boundary can carry.
 */

const MODULE = buildScalarsModel();

describe("inspectableDefinition", () => {
  it("reports the module's own identity and its definition", () => {
    const inspection = inspectableDefinition(MODULE);
    expect(inspection).not.toBeNull();
    expect(inspection!.documentType).toBe("test/scalars");
    expect(inspection!.version).toBe(1);
    expect(inspection!.definition).toBe(
      (MODULE as unknown as { definition: unknown }).definition,
    );
    expect(inspection!.authoring).toStrictEqual(CODE_FIRST_AUTHORING);
    expect(inspection!.authoring.writableThroughDocumentActions).toBe(false);
  });

  it("carries nothing a worker boundary would drop", () => {
    const inspection = inspectableDefinition(MODULE)!;
    // Round-tripped against the original, not against itself: a member
    // `JSON.stringify` dropped would otherwise pass unnoticed.
    expect(JSON.parse(JSON.stringify(inspection))).toStrictEqual(inspection);
    expect(structuredClone(inspection)).toStrictEqual(inspection);
    const functions: string[] = [];
    const walk = (value: unknown, path: string): void => {
      if (typeof value === "function") functions.push(path);
      if (value === null || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        walk(child, `${path}/${key}`);
      }
    };
    walk(inspection, "");
    expect(functions).toEqual([]);
    // The module it came from does carry closures, which is exactly why the
    // inspection is a separate value rather than the module itself.
    expect(typeof (MODULE as unknown as { reducer: unknown }).reducer).toBe(
      "function",
    );
  });

  it("says nothing about a module that carries no definition", () => {
    const { definition: _definition, ...schemaFirst } =
      MODULE as unknown as Record<string, unknown>;
    expect(inspectableDefinition(schemaFirst)).toBeNull();
  });

  it("says nothing about a definition that fails the wire shape", () => {
    const malformed = {
      ...(MODULE as unknown as Record<string, unknown>),
      definition: { kind: "powerhouse.document-model", formatVersion: 2 },
    };
    expect(inspectableDefinition(malformed)).toBeNull();
    // A truncated but well-labelled definition is refused too: an unreadable
    // view in place of the expected editor is worse than no view.
    expect(
      inspectableDefinition({
        ...(MODULE as unknown as Record<string, unknown>),
        definition: {
          kind: "powerhouse.document-model",
          formatVersion: 1,
          specifications: [],
        },
      }),
    ).toBeNull();
  });

  it("refuses a definition that is about a different model", () => {
    // Nothing upstream stops a module from carrying a definition compiled for
    // something else, and a view whose header said one model while its body
    // held another would be worse than no view.
    const definition = (MODULE as unknown as { definition: unknown })
      .definition;
    expect(
      inspectableDefinition({
        definition,
        version: 1,
        documentModel: { global: { id: "totally/other" } },
      }),
    ).toBeNull();
    // A version the definition publishes no specification for is refused too.
    expect(
      inspectableDefinition({
        definition,
        version: 9,
        documentModel: { global: { id: "test/scalars" } },
      }),
    ).toBeNull();
  });

  it("refuses a version that is present but is not one", () => {
    const definition = (MODULE as unknown as { definition: unknown })
      .definition;
    const withVersion = (version: unknown) =>
      inspectableDefinition({
        definition,
        version,
        documentModel: { global: { id: "test/scalars" } },
      });
    // `null` is absent, which is what `version ?? 1` means everywhere else.
    expect(withVersion(null)?.version).toBe(1);
    // `true` and `"1"` both become a number under coercion; neither is a
    // version anyone wrote, so they are refused rather than coerced.
    expect(withVersion(true)).toBeNull();
    expect(withVersion("1")).toBeNull();
    expect(withVersion(1.5)).toBeNull();
    expect(withVersion(undefined)?.version).toBe(1);
    expect(withVersion(1)?.version).toBe(1);
  });

  it("refuses an identity it would have to invent", () => {
    const definition = (MODULE as unknown as { definition: unknown })
      .definition;
    expect(inspectableDefinition({ definition })).toBeNull();
    expect(
      inspectableDefinition({ definition, documentModel: { global: {} } }),
    ).toBeNull();
    expect(
      inspectableDefinition({
        definition,
        version: 0,
        documentModel: { global: { id: "test/scalars" } },
      }),
    ).toBeNull();
    expect(inspectableDefinition(null)).toBeNull();
    expect(inspectableDefinition("test/scalars")).toBeNull();
  });

  it("defaults a missing version the way every other host defaults it", () => {
    const definition = (MODULE as unknown as { definition: unknown })
      .definition;
    expect(
      inspectableDefinition({
        definition,
        documentModel: { global: { id: "test/scalars" } },
      })?.version,
    ).toBe(1);
  });
});
