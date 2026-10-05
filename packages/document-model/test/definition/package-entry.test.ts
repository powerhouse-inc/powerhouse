import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, expectTypeOf, it } from "vitest";
import * as documentModel from "../../index.js";
import * as scalars from "../../scalars.js";
import * as tooling from "../../tooling.js";

/** Bare specifiers a module reaches at runtime, following relative imports. */
function runtimeImports(entry: string): ReadonlySet<string> {
  const bare = new Set<string>();
  const seen = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    for (const [, specifier] of source.matchAll(
      /^(?:import|export)\s+(?!type\b)[^;]*?from\s+"([^"]+)"/gms,
    )) {
      if (specifier.startsWith(".")) {
        visit(resolve(dirname(file), specifier.replace(/\.js$/, ".ts")));
      } else {
        bare.add(specifier);
      }
    }
  };
  visit(fileURLToPath(new URL(entry, import.meta.url)));
  return bare;
}

/**
 * An author imports the unscoped `document-model` package (DECISIONS row 6),
 * so the package root has to carry the entry points. `export *` drops a name
 * silently when two barrels collide, which is what this covers.
 */
describe("the package entry points", () => {
  it("exports the normal author surface from the package root", () => {
    expect(typeof documentModel.defineDocumentModel).toBe("function");
    expect(typeof documentModel.defineDocumentModelFamily).toBe("function");
    expect(typeof documentModel.ph).toBe("object");
    expect(typeof documentModel.ph.object).toBe("function");
    expect(typeof documentModel.ph.String).toBe("function");
    expect(documentModel.DocumentModelDefinitionError.name).toBe(
      "DocumentModelDefinitionError",
    );
  });

  it("keeps the existing package surface", () => {
    expect(typeof documentModel.createReducer).toBe("function");
    expect(typeof documentModel.baseActions).toBe("object");
    expect(typeof documentModel.documentModelDocumentModelModule).toBe(
      "object",
    );
    expect(typeof documentModel.createState).toBe("function");
  });

  it("compiles a model through the package root alone", () => {
    const { defineDocumentModel, ph } = documentModel;
    const model = defineDocumentModel({
      id: "test/entry",
      name: "Entry",
      description: "",
      extension: "entry",
      version: 1,
      author: { name: "Powerhouse" },
      specifications: {
        global: {
          schema: ph.object("EntryState", {
            fields: { title: ph.String({ required: true }) },
          }),
          initialValue: { title: "" },
        },
        local: { schema: null, initialValue: {} },
      },
    });
    const module = model.module("titles", {
      operations: ({ global }) => ({
        setTitle: global({
          input: ph.input({ fields: { title: ph.String({ required: true }) } }),
          reduce(state, input) {
            state.title = input.title;
          },
        }),
      }),
    });
    const Entry = model.finalize({ modules: [module] });
    const document = Entry.reducer(
      Entry.utils.createDocument(),
      Entry.actions.setTitle({ title: "authored in TypeScript" }),
    );
    expect(document.state.global.title).toBe("authored in TypeScript");
    expect(Entry.definition.kind).toBe("powerhouse.document-model");
    expect(
      Entry.documentModel.global.specifications[0].state.global.schema,
    ).toBe("type EntryState {\n  title: String!\n}\n");
  });

  it("keeps the compatibility helper on the tooling subpath only", () => {
    expect(typeof tooling.schemaFirstGraphQLDocument).toBe("function");
    expect(documentModel).not.toHaveProperty("schemaFirstGraphQLDocument");
    expect(documentModel).not.toHaveProperty("stripGraphQLLocations");
  });

  it("exports defineScalar and each value type a catalog field use names", () => {
    expect(typeof documentModel.defineScalar).toBe("function");
    expect(typeof documentModel.packageScalarsOf).toBe("function");
    // A package's declaration emit names these through the root entry. Were
    // one missing, a model using ph.AmountFiat() would fail to build there.
    type Value<T extends documentModel.AnyFieldDescriptor> =
      documentModel.OutputOf<T>;
    expectTypeOf<
      Value<ReturnType<typeof documentModel.ph.AmountFiat<true>>>
    >().toEqualTypeOf<documentModel.AmountWithNumberValue>();
    expectTypeOf<
      Value<ReturnType<typeof documentModel.ph.AmountCrypto<true>>>
    >().toEqualTypeOf<documentModel.AmountWithStringValue>();
    expectTypeOf<
      Value<ReturnType<typeof documentModel.ph.Amount<true>>>
    >().toEqualTypeOf<documentModel.Amount>();
  });

  it("keeps the scalars subpath loadable in a browser", () => {
    expect(scalars.scalarDeclarations).toHaveLength(21);
    expect(scalars.scalarTypeScriptTypes(scalars.scalarCatalog).PHID).toBe(
      "string",
    );
    expect([...runtimeImports("../../scalars.ts")]).toEqual(["zod"]);
  });
});
