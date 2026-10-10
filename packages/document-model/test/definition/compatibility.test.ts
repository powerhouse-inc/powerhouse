import type { DefinitionDiagnostic } from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import { adaptCodeFirstDocumentModelSource } from "../../src/definition/adapters/code-first-document-model-source-adapter.js";
import { schemaFirstSpecification } from "../../src/definition/compatibility.js";
import { compilationReportOf } from "../../src/definition/materialize.js";
import { DocumentModelDefinitionError } from "../../src/definition/diagnostics.js";
import { ph } from "../../src/definition/field.js";
import { defineDocumentModel } from "../../src/definition/model.js";
import { checkRetainedSerialization } from "../../src/definition/tooling/retained-serialization.js";

/**
 * A small model whose every compatibility path exists: two modules would be
 * overkill, but one module with an error and both kinds of example covers
 * every identity path the grammar has.
 */
function ticket() {
  return defineDocumentModel({
    id: "powerhouse/ticket",
    name: "Ticket",
    description: "A ticket.",
    extension: "tkt",
    version: 1,
    author: { name: "Powerhouse" },
    specifications: {
      global: {
        schema: ph.object("TicketState", {
          fields: { title: ph.String({ required: true }) },
        }),
        initialValue: { title: "" },
        examples: [{ key: "empty", value: '{"title":""}' }],
      },
      local: { schema: null, initialValue: {} },
    },
  });
}

function ticketModule(context: ReturnType<typeof ticket>) {
  return context.module("editing", {
    operations: ({ global }) => ({
      setTitle: global({
        input: ph.input({ fields: { title: ph.String({ required: true }) } }),
        errors: { TitleTaken: { code: "TITLE_TAKEN" } },
        examples: [{ key: "one", value: '{"title":"a"}' }],
        reduce(state, input) {
          state.title = input.title;
        },
      }),
    }),
  });
}

const EVERY_IDENTITY_PATH = [
  "state-example/global/empty",
  "module/editing",
  "operation/editing/setTitle",
  "error/editing/setTitle/TitleTaken",
  "operation-example/editing/setTitle/one",
] as const;

function storedIds(
  overrides: Partial<Record<string, string>> = {},
): Record<string, string> {
  return Object.fromEntries(
    EVERY_IDENTITY_PATH.map((path, index) => [
      path,
      overrides[path] ?? `00000000-0000-4000-8000-00000000000${index}`,
    ]),
  );
}

function diagnosticsOf(run: () => unknown): readonly DefinitionDiagnostic[] {
  try {
    run();
  } catch (error) {
    if (error instanceof DocumentModelDefinitionError) return error.diagnostics;
    throw error;
  }
  return [];
}

function finalizeWith(
  compatibility?: ReturnType<typeof schemaFirstSpecification>,
) {
  const context = ticket();
  const module = ticketModule(context);
  return context.finalize(
    compatibility === undefined
      ? { modules: [module] }
      : { modules: [module], compatibility },
  );
}

describe("compatibility declarations", () => {
  describe("the three modes are independent", () => {
    it("explicit identity retains no string and selects no AST", () => {
      const model = finalizeWith(
        schemaFirstSpecification({ ids: storedIds() }),
      );
      expect(model.definition.compatibility).toStrictEqual({
        identity: "explicit-schema-first",
        scalarCoercion: "document-engineering-1.40",
        serialization: "canonical-v1",
      });
      const [specification] = model.definition.specifications;
      expect(specification.graphQLCompatibility).toBeNull();
      // The stored strings are still the printer's own output.
      expect(specification.state.global.materialized.schema).toBe(
        "type TicketState {\n  title: String!\n}\n",
      );
      expect(specification.modules[0].id).toBe(
        "00000000-0000-4000-8000-000000000001",
      );
    });

    it("a retained string derives every ID and selects no AST", () => {
      const model = finalizeWith(
        schemaFirstSpecification({
          serialization: {
            "state/global/schema": "type TicketState{\n    title: String!\n}",
          },
        }),
      );
      expect(model.definition.compatibility).toStrictEqual({
        identity: "derived-v1",
        scalarCoercion: "document-engineering-1.40",
        serialization: "explicit-schema-first",
      });
      const [specification] = model.definition.specifications;
      expect(specification.graphQLCompatibility).toBeNull();
      expect(specification.state.global.materialized.schema).toBe(
        "type TicketState{\n    title: String!\n}",
      );
      // The derived ID is unchanged by the retained string.
      expect(specification.modules[0].id).toBe(
        finalizeWith().definition.specifications[0].modules[0].id,
      );
    });

    it("the AST projection retains no string and derives every ID", () => {
      const context = defineDocumentModel({
        id: "powerhouse/ticket",
        name: "Ticket",
        description: "A ticket.",
        extension: "tkt",
        version: 1,
        author: { name: "Powerhouse" },
        specifications: {
          graphQLCompatibility: {
            kind: "graphql-ast-v1",
            preserveDefinitionOrder: true,
            document: {
              kind: "Document",
              definitions: [
                {
                  kind: "ObjectTypeDefinition",
                  name: { kind: "Name", value: "TicketState" },
                  interfaces: [],
                  directives: [],
                  fields: [
                    {
                      kind: "FieldDefinition",
                      name: { kind: "Name", value: "title" },
                      arguments: [],
                      directives: [],
                      type: {
                        kind: "NonNullType",
                        type: {
                          kind: "NamedType",
                          name: { kind: "Name", value: "String" },
                        },
                      },
                    },
                  ],
                },
              ],
            },
          },
          global: {
            schema: ph.object("TicketState", {
              fields: { title: ph.String({ required: true }) },
            }),
            initialValue: { title: "" },
          },
          local: { schema: null, initialValue: {} },
        },
      });
      const model = context.finalize({ modules: [] });
      expect(model.definition.compatibility.identity).toBe("derived-v1");
      expect(model.definition.compatibility.serialization).toBe("canonical-v1");
      expect(
        model.definition.specifications[0].graphQLCompatibility,
      ).not.toBeNull();
    });
  });

  describe("identity overrides are exact", () => {
    it("rejects a missing override for a declared path", () => {
      for (const missing of EVERY_IDENTITY_PATH) {
        const ids = storedIds();
        delete ids[missing];
        const diagnostics = diagnosticsOf(() =>
          finalizeWith(schemaFirstSpecification({ ids })),
        );
        expect(
          diagnostics.some(
            (entry) =>
              entry.code === "PH-DM-IDENTITY-INVALID" &&
              entry.expected === `ids[${JSON.stringify(missing)}]`,
          ),
        ).toBe(true);
      }
    });

    it("reports a reused stored ID instead of rejecting it", () => {
      // `document-drive` gives SET_DRIVE_ICON and REMOVE_TRIGGER one stored
      // ID. Rejecting that would make the model inexpressible code-first and
      // rewriting it would change persisted bytes, so explicit identity
      // reports the reuse and keeps the stored value.
      const reused = "00000000-0000-4000-8000-000000000001";
      const model = finalizeWith(
        schemaFirstSpecification({
          ids: storedIds({ "operation/editing/setTitle": reused }),
        }),
      );
      const [specification] = model.definition.specifications;
      expect(specification.modules[0].id).toBe(reused);
      expect(specification.modules[0].operations[0].id).toBe(reused);

      // Reported, not swallowed: the warning reaches anything that asks the
      // module what compilation observed.
      const report = compilationReportOf(model);
      expect(report?.diagnostics.map((entry) => entry.code)).toStrictEqual([
        "PH-DM-IDENTITY-REUSED",
      ]);
      expect(
        adaptCodeFirstDocumentModelSource(model, {
          specifier: "./ticket.js",
        }).diagnostics.map((entry) => entry.code),
      ).toStrictEqual(["PH-DM-IDENTITY-REUSED"]);
    });

    it("records which compatibility modes a declaration selected", () => {
      const model = finalizeWith(
        schemaFirstSpecification({
          ids: storedIds(),
          names: { "module/editing": { storedName: "editing_operations" } },
        }),
      );
      expect(compilationReportOf(model)?.compatibility).toStrictEqual({
        identity: "explicit-schema-first",
        serialization: "canonical-v1",
        paths: {
          ids: [...EVERY_IDENTITY_PATH].sort(),
          names: ["module/editing"],
          serialization: [],
        },
      });
    });

    it("rejects a derived collision, which is a declaration mistake", () => {
      const context = ticket();
      const first = context.module("editing", {
        operations: ({ global }) => ({
          setTitle: global({
            input: ph.input({ fields: {} }),
            reduce() {},
          }),
        }),
      });
      const second = context.module("editing", {
        operations: ({ global }) => ({
          setTitle: global({
            input: ph.input({ fields: {} }),
            reduce() {},
          }),
        }),
      });
      const diagnostics = diagnosticsOf(() =>
        context.finalize({ modules: [first, second] }),
      );
      expect(
        diagnostics.some((entry) => entry.code === "PH-DM-DUPLICATE-NAME"),
      ).toBe(true);
    });

    it("rejects an override for a path the declaration does not have", () => {
      const diagnostics = diagnosticsOf(() =>
        finalizeWith(
          schemaFirstSpecification({
            ids: {
              ...storedIds(),
              "module/absent": "00000000-0000-4000-8000-0000000000ff",
            },
          }),
        ),
      );
      expect(diagnostics[0]).toMatchObject({
        code: "PH-DM-IDENTITY-INVALID",
        path: ["compatibility", "ids", "module/absent"],
      });
    });

    it("rejects a malformed override", () => {
      for (const id of ["", "  ", 4, null, "é"]) {
        const diagnostics = diagnosticsOf(() =>
          schemaFirstSpecification({
            ids: { "module/editing": id as string },
          }),
        );
        expect(diagnostics[0]?.code).toBe("PH-DM-IDENTITY-INVALID");
      }
      // The corpus stores opaque base64 IDs as well as UUIDs, so an opaque
      // nonempty string is valid.
      expect(() =>
        schemaFirstSpecification({
          ids: { "module/editing": "GRzuvv78tBvmB6ciitokLfonNHA=" },
        }),
      ).not.toThrow();
    });

    it("rejects a key that is not an identity path", () => {
      const diagnostics = diagnosticsOf(() =>
        schemaFirstSpecification({
          ids: { editing: "00000000-0000-4000-8000-000000000000" },
        }),
      );
      expect(diagnostics[0]?.code).toBe("PH-DM-IDENTITY-INVALID");
    });

    it("keeps one logical item's ID across two versions of a family", () => {
      const shared = "00000000-0000-4000-8000-0000000000aa";
      const build = (version: number) => {
        const context = defineDocumentModel({
          id: "powerhouse/ticket",
          name: "Ticket",
          description: "A ticket.",
          extension: "tkt",
          version,
          author: { name: "Powerhouse" },
          specifications: {
            global: {
              schema: ph.object("TicketState", {
                fields: { title: ph.String({ required: true }) },
              }),
              initialValue: { title: "" },
            },
            local: { schema: null, initialValue: {} },
          },
        });
        const module = context.module("editing", {
          operations: ({ global }) => ({
            setTitle: global({
              input: ph.input({
                fields: { title: ph.String({ required: true }) },
              }),
              reduce(state, input) {
                state.title = input.title;
              },
            }),
          }),
        });
        return context.version({
          modules: [module],
          compatibility: schemaFirstSpecification({
            ids: {
              "module/editing": shared,
              "operation/editing/setTitle":
                "00000000-0000-4000-8000-0000000000bb",
            },
          }),
        });
      };
      // Reuse across versions is required, not a duplicate.
      expect(() => build(1)).not.toThrow();
      expect(() => build(2)).not.toThrow();
    });
  });

  describe("serialization overrides are checked, not trusted", () => {
    it("fails finalization when a retained initial value differs", () => {
      const diagnostics = diagnosticsOf(() =>
        finalizeWith(
          schemaFirstSpecification({
            serialization: { "state/global/initialValue": '{"title":"other"}' },
          }),
        ),
      );
      expect(diagnostics[0]).toMatchObject({
        code: "PH-DM-COMPATIBILITY-INVALID",
        path: ["specifications", "global", "initialValue"],
        expected: '{"title":""}',
      });
    });

    it("accepts a whitespace-different retained initial value exactly", () => {
      const model = finalizeWith(
        schemaFirstSpecification({
          serialization: { "state/global/initialValue": '{ "title" : "" }' },
        }),
      );
      expect(
        model.definition.specifications[0].state.global.materialized
          .initialValue,
      ).toBe('{ "title" : "" }');
      expect(
        model.documentModel.global.specifications[0].state.global.initialValue,
      ).toBe('{ "title" : "" }');
    });

    it("accepts the stored empty local initial value", () => {
      const model = finalizeWith(
        schemaFirstSpecification({
          serialization: { "state/local/initialValue": "" },
        }),
      );
      // The stored spelling of an empty local scope is retained as it was.
      expect(
        model.definition.specifications[0].state.local.materialized
          .initialValue,
      ).toBe("");
    });

    it("fails when a retained initial value is not JSON", () => {
      const diagnostics = diagnosticsOf(() =>
        finalizeWith(
          schemaFirstSpecification({
            serialization: { "state/global/initialValue": "{title:}" },
          }),
        ),
      );
      expect(diagnostics[0]?.message).toContain("not JSON");
    });

    it("retains an SDL override at finalization and checks it in tooling", () => {
      const equivalent = finalizeWith(
        schemaFirstSpecification({
          serialization: {
            "state/global/schema": "type TicketState{\n    title: String!\n}",
            "operation/editing/setTitle/schema":
              "input SetTitleInput{\n    title: String!\n}",
          },
        }),
      );
      expect(
        checkRetainedSerialization({
          definition: equivalent.definition,
          documentModel: equivalent.documentModel,
        }),
      ).toStrictEqual([]);

      const wrong = finalizeWith(
        schemaFirstSpecification({
          serialization: {
            "state/global/schema": "type TicketState{\n    title: String\n}",
          },
        }),
      );
      const diagnostics = checkRetainedSerialization({
        definition: wrong.definition,
        documentModel: wrong.documentModel,
      });
      expect(diagnostics[0]).toMatchObject({
        code: "PH-DM-COMPATIBILITY-INVALID",
        path: ["specifications", 0, "state", "global", "schema", "TicketState"],
      });
      expect(diagnostics[0].message).toContain("TicketState");
    });

    it("reports a retained segment that declares the wrong types", () => {
      const model = finalizeWith(
        schemaFirstSpecification({
          serialization: {
            "state/global/schema":
              "type TicketState { title: String! }\n\ntype Ghost { id: ID }",
          },
        }),
      );
      const diagnostics = checkRetainedSerialization({
        definition: model.definition,
        documentModel: model.documentModel,
      });
      expect(diagnostics[0]?.message).toContain("Ghost");
    });

    it("rejects a serialization key that is not a serialization path", () => {
      const diagnostics = diagnosticsOf(() =>
        schemaFirstSpecification({
          serialization: {
            "state/global": "type TicketState { title: String }",
          },
        }),
      );
      expect(diagnostics[0]?.code).toBe("PH-DM-COMPATIBILITY-INVALID");
    });

    it("rejects an override with nothing to retain", () => {
      const diagnostics = diagnosticsOf(() =>
        finalizeWith(
          schemaFirstSpecification({
            serialization: {
              "operation/absent/missing/schema": "input X { a: ID }",
            },
          }),
        ),
      );
      expect(diagnostics[0]).toMatchObject({
        code: "PH-DM-COMPATIBILITY-INVALID",
        path: [
          "compatibility",
          "serialization",
          "operation/absent/missing/schema",
        ],
      });
    });

    it("reports an override for the empty local schema as surplus", () => {
      const diagnostics = diagnosticsOf(() =>
        finalizeWith(
          schemaFirstSpecification({
            serialization: {
              "state/local/schema": "type TicketLocalState { a: ID }",
            },
          }),
        ),
      );
      expect(diagnostics[0]?.path).toStrictEqual([
        "compatibility",
        "serialization",
        "state/local/schema",
      ]);
    });
  });

  describe("name overrides", () => {
    it("stores the overridden module and operation names", () => {
      const model = finalizeWith(
        schemaFirstSpecification({
          names: {
            "module/editing": { storedName: "editing_operations" },
            "operation/editing/setTitle": { storedName: "SET_TITLE" },
          },
        }),
      );
      const [module] = model.definition.specifications[0].modules;
      expect(module.name).toBe("editing_operations");
      expect(module.operations[0].name).toBe("SET_TITLE");
      // The stored specification carries the same names.
      const stored = model.documentModel.global.specifications[0].modules[0];
      expect(stored.name).toBe("editing_operations");
      expect(stored.operations[0].name).toBe("SET_TITLE");
      // A name override changes no mode.
      expect(model.definition.compatibility).toStrictEqual({
        identity: "derived-v1",
        scalarCoercion: "document-engineering-1.40",
        serialization: "canonical-v1",
      });
    });

    it("rejects an override for a name the stored specification never carries", () => {
      const diagnostics = diagnosticsOf(() =>
        schemaFirstSpecification({
          names: {
            "operation/editing/setTitle": {
              reducerMethod: "setTitleOperation",
            } as never,
          },
        }),
      );
      expect(diagnostics[0]?.code).toBe("PH-DM-COMPATIBILITY-INVALID");
    });

    it("rejects an override for a module the declaration does not have", () => {
      const diagnostics = diagnosticsOf(() =>
        finalizeWith(
          schemaFirstSpecification({
            names: { "module/absent": { storedName: "x" } },
          }),
        ),
      );
      expect(diagnostics[0]?.path).toStrictEqual([
        "compatibility",
        "names",
        "module/absent",
      ]);
    });
  });

  it("rejects compatibility data the helper did not build", () => {
    const context = ticket();
    const module = ticketModule(context);
    const diagnostics = diagnosticsOf(() =>
      context.finalize({
        modules: [module],
        compatibility: { ids: { "module/editing": "x" } } as never,
      }),
    );
    expect(diagnostics[0]).toMatchObject({
      code: "PH-DM-COMPATIBILITY-INVALID",
      path: ["compatibility"],
    });
  });
});
