import type { DefinitionDiagnostic } from "@powerhousedao/shared/document-model";
import { buildSchema, validateSchema } from "graphql";
import { describe, expect, it, vi } from "vitest";
import { DocumentModelDefinitionError } from "../../src/definition/diagnostics.js";
import { ph } from "../../src/definition/field.js";
import { defineDocumentModel } from "../../src/definition/model.js";
import { canonicalJson } from "../../src/definition/primitives.js";
import { SCALAR_CATALOG_NAMES } from "../../src/definition/scalars/catalog.js";
import { checkRetainedSerialization } from "../../src/definition/tooling/retained-serialization.js";
import { loadParityRoots, type ParityRoot } from "./corpus.js";
import {
  assembleStoredSchema,
  goldenContents,
  printCanonicalSchema,
  readGolden,
  storedStrings,
} from "./goldens.js";

/**
 * The proof the rest of this project rests on: an equivalent code-first
 * declaration and its schema-first original compile to the same thing.
 *
 * Six assertions per root. The oracle is canonical deep equality of the
 * parsed values plus exact equality of every embedded string; deriving new
 * IDs and comparing only names would prove nothing, so stable IDs are part of
 * every comparison.
 */

const SCALAR_PRELUDE = SCALAR_CATALOG_NAMES.map(
  (name) => `scalar ${name}`,
).join("\n");

const roots: readonly ParityRoot[] = loadParityRoots();

function diagnosticsOf(run: () => unknown): readonly DefinitionDiagnostic[] {
  try {
    run();
  } catch (error) {
    if (error instanceof DocumentModelDefinitionError) return error.diagnostics;
    throw error;
  }
  return [];
}

describe("nine-root parity", () => {
  it("covers every model root in this repository", () => {
    expect(roots.map((root) => root.name)).toStrictEqual([
      "document-drive",
      "reactor-group",
      "app-module",
      "document-editor",
      "processor-module",
      "subgraph-module",
      "vetra-package",
      "e2e-todo",
      "versioned-todo",
      "sample",
    ]);
    // Ten specification versions across the nine shipped roots, plus the
    // synthetic one that carries the examples none of them have.
    expect(
      roots
        .filter((root) => root.name !== "sample")
        .reduce((total, root) => total + root.versions.length, 0),
    ).toBe(10);
  });

  describe.each([
    "document-drive",
    "reactor-group",
    "app-module",
    "document-editor",
    "processor-module",
    "subgraph-module",
    "vetra-package",
    "e2e-todo",
    "versioned-todo",
    "sample",
  ])("%s", (name) => {
    const root = (): ParityRoot => {
      const found = roots.find((candidate) => candidate.name === name);
      if (found === undefined) throw new Error(`${name} did not load`);
      return found;
    };

    it("structured: both adapters produce one definition", () => {
      const { codeFirst, schemaFirst } = root();
      expect(codeFirst).toHaveLength(schemaFirst.length);
      codeFirst.forEach((artifact, index) => {
        expect(canonicalJson(artifact.definition)).toBe(
          canonicalJson(schemaFirst[index].definition),
        );
        expect(artifact.digest).toBe(schemaFirst[index].digest);
      });
    });

    it("stored-state: both produce one DocumentModelPHState", () => {
      const { codeFirst, schemaFirst } = root();
      codeFirst.forEach((artifact, index) => {
        expect(canonicalJson(artifact.documentModel)).toBe(
          canonicalJson(schemaFirst[index].documentModel),
        );
      });
    });

    it("order: every embedded string matches exactly", () => {
      const { codeFirst, schemaFirst } = root();
      const ours = storedStrings(codeFirst[0].documentModel);
      const theirs = storedStrings(schemaFirst[0].documentModel);
      expect(ours.map(([path]) => path)).toStrictEqual(
        theirs.map(([path]) => path),
      );
      ours.forEach(([path, value], index) => {
        expect(`${path}=${value}`).toBe(
          `${theirs[index][0]}=${theirs[index][1]}`,
        );
      });
    });

    it("identity: every ID matches its vector", () => {
      const { codeFirst, schemaFirst } = root();
      codeFirst.forEach((artifact, index) => {
        expect(artifact.identity).toStrictEqual(schemaFirst[index].identity);
        expect(artifact.identity.length).toBeGreaterThan(0);
      });
      const golden = JSON.parse(readGolden(`${name}.identity.json`)) as unknown;
      expect(canonicalJson(codeFirst[0].identity)).toBe(canonicalJson(golden));
    });

    it("golden: the committed bytes are what the declaration produces", () => {
      const { codeFirst } = root();
      for (const [suffix, contents] of goldenContents(codeFirst[0])) {
        expect(contents, suffix).toBe(readGolden(`${name}.${suffix}`));
      }
    });

    it("schema: the printer's own output matches its golden", () => {
      const { codeFirst } = root();
      // The stored segments are retained overrides for every corpus model,
      // so this is the assertion that pins the printer: it compares what the
      // printer produces from the structured types, not what the model
      // stores.
      for (const specification of codeFirst[0].definition.specifications) {
        expect(printCanonicalSchema(specification)).toBe(
          readGolden(`${name}.v${specification.version}.canonical.graphql`),
        );
      }
    });

    it("schema: the assembled stored SDL builds a valid schema", () => {
      const { codeFirst } = root();
      for (const specification of codeFirst[0].documentModel.global
        .specifications) {
        const assembled = assembleStoredSchema(specification);
        expect(assembled).toBe(
          readGolden(`${name}.v${specification.version}.graphql`),
        );
        // The stored segments have to assemble into one buildable document:
        // no duplicate definition, no dangling reference. A model declares no
        // root operation type — the host adds one — so the check supplies the
        // Query root `validateSchema` requires.
        const schema = buildSchema(
          `${SCALAR_PRELUDE}\n\ntype Query {\n  _host: Boolean\n}\n\n${assembled}`,
          { assumeValidSDL: false },
        );
        expect(
          validateSchema(schema).map((error) => error.message),
        ).toStrictEqual([]);
      }
    });

    it("repeat-import: a second cold import produces the same digest", async () => {
      const { codeFirst } = root();
      // A reset registry re-evaluates every declaration, so the compiler
      // runs again from nothing. Calling `loadParityRoots()` twice would
      // re-adapt the same module objects and could not fail.
      vi.resetModules();
      const reloaded = await import("./corpus.js");
      const again = reloaded
        .loadParityRoots()
        .find((candidate) => candidate.name === name);
      expect(again?.codeFirst[0].definition).not.toBe(codeFirst[0].definition);
      expect(again?.codeFirst.map((artifact) => artifact.digest)).toStrictEqual(
        codeFirst.map((artifact) => artifact.digest),
      );
    });

    it("produces a usable module, not only a specification", () => {
      const { codeFirst } = root();
      const fixture = codeFirst[0];
      const operations =
        fixture.definition.specifications
          .find((entry) => entry.version === fixture.version)
          ?.modules.flatMap((module) => module.operations) ?? [];
      expect(operations.length).toBeGreaterThan(0);
    });

    it("retained serialization describes the declaration", () => {
      const { codeFirst } = root();
      const diagnostics = checkRetainedSerialization(codeFirst[0]);
      expect(
        diagnostics.filter((entry) => entry.severity === "error"),
      ).toStrictEqual([]);
    });
  });

  it("regenerates byte-identical goldens on two runs", () => {
    for (const root of roots) {
      const first = goldenContents(root.codeFirst[0]);
      const second = goldenContents(
        loadParityRoots().find((candidate) => candidate.name === root.name)
          ?.codeFirst[0] ?? root.codeFirst[0],
      );
      expect([...second.entries()]).toStrictEqual([...first.entries()]);
    }
  });
});

describe("negative cases", () => {
  it("rejects a validation option other than required, from JavaScript", () => {
    const untyped = ph as unknown as {
      String: (options: Record<string, unknown>) => unknown;
    };
    const diagnostics = diagnosticsOf(() => untyped.String({ minLength: 2 }));
    expect(diagnostics[0]?.code).toBe("PH-DEF-FIELD-OPTION-UNSUPPORTED");
  });

  const stateRoot = (schema: unknown, local?: unknown) =>
    diagnosticsOf(() =>
      defineDocumentModel({
        id: "test/roots",
        name: "Roots",
        description: "",
        extension: "roots",
        version: 1,
        author: { name: "Powerhouse" },
        specifications: {
          global: { schema, initialValue: {} },
          local:
            local === undefined ? { schema: null, initialValue: {} } : local,
        },
      } as never),
    );

  it.each([
    ["absent global root", undefined],
    ["an input as root", ph.input("RootsState", { fields: {} })],
    ["an enum as root", ph.enum("RootsState", { values: ["A"] })],
    [
      "a union as root",
      ph.union("RootsState", {
        members: [ph.object("Member", { fields: { id: ph.String() } })],
      }),
    ],
    ["a field use as root", ph.String()],
    [
      "a wrongly named global root",
      ph.object("WrongState", { fields: { id: ph.String() } }),
    ],
  ])("rejects %s", (_case, schema) => {
    const diagnostics = stateRoot(schema);
    expect(
      diagnostics.some((entry) => entry.code === "PH-DM-STATE-ROOT-INVALID"),
    ).toBe(true);
  });

  it("rejects a wrongly named local root", () => {
    const diagnostics = stateRoot(
      ph.object("RootsState", { fields: { id: ph.String() } }),
      {
        schema: ph.object("WrongLocalState", { fields: { id: ph.String() } }),
        initialValue: { id: null },
      },
    );
    expect(
      diagnostics.some((entry) => entry.code === "PH-DM-STATE-ROOT-INVALID"),
    ).toBe(true);
  });

  it("accepts the empty local case", () => {
    const context = defineDocumentModel({
      id: "test/roots",
      name: "Roots",
      description: "",
      extension: "roots",
      version: 1,
      author: { name: "Powerhouse" },
      specifications: {
        global: {
          schema: ph.object("RootsState", { fields: { id: ph.String() } }),
          initialValue: { id: null },
        },
        local: { schema: null, initialValue: {} },
      },
    });
    const model = context.finalize({ modules: [] });
    expect(
      model.definition.specifications[0].state.local.materialized,
    ).toMatchObject({ schema: "", initialValue: "{}" });
  });
});

describe("coverage cases", () => {
  it("retains an unreachable type only through auxiliaryTypes", () => {
    const Orphan = ph.object("Orphan", { fields: { id: ph.String() } });
    const build = (auxiliary: boolean) =>
      defineDocumentModel({
        id: "test/aux",
        name: "Aux",
        description: "",
        extension: "aux",
        version: 1,
        author: { name: "Powerhouse" },
        specifications: {
          ...(auxiliary && { auxiliaryTypes: [Orphan] }),
          global: {
            schema: ph.object("AuxState", { fields: { id: ph.String() } }),
            initialValue: { id: null },
          },
          local: { schema: null, initialValue: {} },
        },
      }).finalize({ modules: [] });
    expect(
      build(false).definition.specifications[0].types.map((type) => type.name),
    ).toStrictEqual(["AuxState"]);
    expect(
      build(true).definition.specifications[0].types.map((type) => type.name),
    ).toStrictEqual(["AuxState", "Orphan"]);
  });

  it("keeps the example key in the definition and drops it from stored state", () => {
    const sample = roots.find((root) => root.name === "sample");
    const specification =
      sample?.codeFirst[0].definition.specifications[0] ??
      roots[0].codeFirst[0].definition.specifications[0];
    const examples = [
      ...specification.state.global.examples,
      ...specification.modules.flatMap((module) =>
        module.operations.flatMap((operation) => operation.examples),
      ),
    ];
    // Both positions, or the assertion below would run on nothing.
    expect(examples.length).toBeGreaterThanOrEqual(2);
    for (const example of examples) {
      expect(Object.keys(example).sort()).toStrictEqual(["id", "key", "value"]);
    }
    expect(specification.state.global.materialized.examples).toHaveLength(1);
    for (const example of specification.state.global.materialized.examples) {
      expect(Object.keys(example).sort()).toStrictEqual(["id", "value"]);
    }
  });

  it("preserves a stored error code that differs from its name", () => {
    // Every corpus model stores code === name, so the divergence needs its
    // own declaration: the runtime class follows the reducer-facing key while
    // the stored code stays independent metadata.
    const context = defineDocumentModel({
      id: "test/codes",
      name: "Codes",
      description: "",
      extension: "codes",
      version: 1,
      author: { name: "Powerhouse" },
      specifications: {
        global: {
          schema: ph.object("CodesState", { fields: { id: ph.String() } }),
          initialValue: { id: null },
        },
        local: { schema: null, initialValue: {} },
      },
    });
    const module = context.module("ops", {
      operations: ({ global }) => ({
        act: global({
          input: ph.input({ fields: {} }),
          errors: { Denied: { code: "ACCESS_DENIED", name: "AccessDenied" } },
          reduce(_state, _input, ctx) {
            throw new ctx.errors.Denied();
          },
        }),
      }),
    });
    const model = context.finalize({ modules: [module] });
    const [error] =
      model.definition.specifications[0].modules[0].operations[0].errors;
    expect(error).toMatchObject({
      key: "Denied",
      code: "ACCESS_DENIED",
      name: "AccessDenied",
    });

    // The corpus keeps its own invariant: a stored name is the class key.
    const corpusErrors =
      roots[1].codeFirst[0].definition.specifications[0].modules.flatMap(
        (candidate) =>
          candidate.operations.flatMap((operation) => operation.errors),
      );
    expect(corpusErrors.length).toBeGreaterThan(0);
    for (const stored of corpusErrors) {
      expect(stored.key).toBe(stored.name);
    }
  });

  it("keeps null and empty-string metadata apart", () => {
    const { codeFirst } = roots[7];
    const operation =
      codeFirst[0].definition.specifications[0].modules[0].operations[0];
    // The corpus stores "" for these; a code-first declaration that omitted
    // them would store null, and the parity assertions would catch it.
    expect(operation.description).toBe("");
    expect(operation.template).toBe("");
    expect(operation.reducer).not.toBe("");
  });

  it("gives two operations one class key with different descriptions", () => {
    const context = defineDocumentModel({
      id: "test/errors",
      name: "Errors",
      description: "",
      extension: "err",
      version: 1,
      author: { name: "Powerhouse" },
      specifications: {
        global: {
          schema: ph.object("ErrorsState", { fields: { id: ph.String() } }),
          initialValue: { id: null },
        },
        local: { schema: null, initialValue: {} },
      },
    });
    const module = context.module("ops", {
      operations: ({ global }) => ({
        first: global({
          input: ph.input({ fields: {} }),
          errors: { Denied: { description: "first" } },
          reduce() {},
        }),
        second: global({
          input: ph.input({ fields: {} }),
          errors: { Denied: { description: "second" } },
          reduce() {},
        }),
      }),
    });
    const model = context.finalize({ modules: [module] });
    const [one, two] = model.definition.specifications[0].modules[0].operations;
    expect(one.errors[0].key).toBe(two.errors[0].key);
    expect(one.errors[0].id).not.toBe(two.errors[0].id);
    expect([
      one.errors[0].description,
      two.errors[0].description,
    ]).toStrictEqual(["first", "second"]);
  });
});
