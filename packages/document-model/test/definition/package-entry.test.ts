import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import * as documentModel from "../../index.js";
import * as definitionEntry from "../../src/definition/index.js";

function runtimeImports(entry: string): readonly string[] {
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
  visit(resolve(import.meta.dirname, entry));
  return [...bare].sort();
}

describe("the package entry", () => {
  it("exports the code-first author surface beside the existing one", () => {
    const names = Object.keys(definitionEntry).sort();
    expect(names).toStrictEqual([
      "DefinitionError",
      "defineDocumentModel",
      "defineDocumentModelFamily",
      "materialize",
      "ph",
    ]);
    expect(
      names.filter(
        (name) =>
          documentModel[name as keyof typeof documentModel] !==
          definitionEntry[name as keyof typeof definitionEntry],
      ),
    ).toStrictEqual([]);
    expect(typeof documentModel.createReducer).toBe("function");
    expect(typeof documentModel.baseActions).toBe("object");
  });

  it("compiles and runs a model through the package root alone", () => {
    const { defineDocumentModel, materialize, ph } = documentModel;
    const model = defineDocumentModel({
      id: "test/entry",
      name: "Entry",
      description: "",
      extension: "entry",
      version: 1,
      author: { name: "Powerhouse" },
      scopes: {
        global: {
          schema: ph.object("EntryState", {
            fields: { title: ph.String({ required: true }) },
          }),
          initialValue: { title: "" },
        },
        local: { schema: null, initialValue: {} },
      },
    });
    const titles = model.module("titles", {
      operations: ({ global }) => ({
        setTitle: global({
          input: ph.input({ fields: { title: ph.String({ required: true }) } }),
          reduce(state, input) {
            state.title = input.title;
          },
        }),
      }),
    });
    const Entry = materialize(model.version({ modules: [titles] }));
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

  it("throws a DefinitionError with structured diagnostics through the package root", () => {
    const { DefinitionError, defineDocumentModel, ph } = documentModel;
    let caught: unknown;
    try {
      defineDocumentModel({
        id: "test/entry",
        name: "Entry",
        description: "",
        extension: "entry",
        version: 0,
        author: { name: "Powerhouse" },
        scopes: {
          global: {
            schema: ph.object("EntryState", {
              fields: { title: ph.String({ required: true }) },
            }),
            initialValue: { title: "" },
          },
          local: { schema: null, initialValue: {} },
        },
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(DefinitionError);
    expect(
      (caught as InstanceType<typeof DefinitionError>).diagnostics.map(
        ({ code, path }) => ({ code, path }),
      ),
    ).toEqual([{ code: "PH-DM-DECLARATION-INVALID", path: ["version"] }]);
  });

  it("reaches no GraphQL runtime or Node built-in from the definition entry", () => {
    expect(runtimeImports("../../src/definition/index.ts")).toStrictEqual([
      "@powerhousedao/shared/document-model",
      "change-case",
      "zod",
    ]);
  });
});
