import type {
  DocumentModelDefinition,
  DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import { mergeTypeDefs } from "@graphql-tools/merge";
import {
  defineDocumentModel,
  defineDocumentModelFamily,
  ph,
} from "document-model";
import { schemaFirstGraphQLDocument } from "document-model/tooling";
import {
  buildSchema,
  type DocumentNode,
  type GraphQLEnumType,
  type GraphQLObjectType,
  type GraphQLSchema,
  Kind,
  parse,
  print,
  visit,
} from "graphql";
import { describe, expect, it } from "vitest";
import { printCompatibilityDocument } from "../src/graphql/structured-projection.js";
import {
  createSchema,
  generateDocumentModelSchema,
  getDocumentModelTypeDefs,
} from "../src/utils/create-schema.js";
import { asSchemaFirst, hostFor, printSchema } from "./utils/graphql-host.js";

/**
 * A code-first module carries both a structured definition and the stored
 * specification a schema-first model has. Each case projects the same module
 * both ways and compares the structured output with the real stored-SDL
 * output.
 */
const EMPTY_TYPEDEFS: DocumentNode = { kind: Kind.DOCUMENT, definitions: [] };

/**
 * A model with two operation modules, a local state, a named input reached
 * from an operation, a nested list, a union, an enum, and an operation with no
 * fields.
 */
function buildInvoice(): DocumentModelModule {
  const Currency = ph.enum("Currency", { values: ["USD", "EUR"] });
  const LineItem = ph.object("LineItem", {
    fields: {
      id: ph.String({ required: true }),
      amount: ph.Int({ required: true }),
      currency: ph.ref(Currency),
    },
  });
  const Note = ph.object("Note", {
    fields: { body: ph.String({ required: true }) },
  });
  const Attachment = ph.object("Attachment", {
    fields: { url: ph.URL({ required: true }) },
  });
  const Annotation = ph.union("Annotation", { members: [Note, Attachment] });
  const LineItemInput = ph.input("LineItemInput", {
    fields: {
      id: ph.String({ required: true }),
      amount: ph.Int({ required: true }),
    },
  });

  const context = defineDocumentModel({
    id: "test/invoice",
    name: "Invoice",
    description: "An invoice.",
    extension: "invoice",
    version: 1,
    author: { name: "Powerhouse", website: null },
    specifications: {
      global: {
        schema: ph.object("InvoiceState", {
          fields: {
            title: ph.String({ required: true }),
            items: ph.list(ph.ref(LineItem, { required: true }), {
              required: true,
            }),
            groups: ph.list(
              ph.list(ph.ref(LineItem, { required: true }), { required: true }),
            ),
            annotations: ph.list(ph.ref(Annotation, { required: true })),
          },
        }),
        initialValue: { title: "", items: [], groups: null, annotations: null },
      },
      local: {
        schema: ph.object("InvoiceLocalState", {
          fields: { draft: ph.Boolean({ required: true }) },
        }),
        initialValue: { draft: true },
      },
    },
  });

  const header = context.module("header", {
    operations: ({ global }) => ({
      setTitle: global({
        input: ph.input({ fields: { title: ph.String({ required: true }) } }),
        reduce(state, input) {
          state.title = input.title;
        },
      }),
      clearTitle: global({
        input: ph.input({ fields: {} }),
        reduce(state) {
          state.title = "";
        },
      }),
    }),
  });

  const items = context.module("items", {
    operations: ({ global, local }) => ({
      addItem: global({
        input: ph.input({
          fields: { item: ph.ref(LineItemInput, { required: true }) },
        }),
        reduce(state, input) {
          state.items.push({
            id: input.item.id,
            amount: input.item.amount,
            currency: null,
          });
        },
      }),
      setDraft: local({
        input: ph.input({ fields: { draft: ph.Boolean({ required: true }) } }),
        reduce(state, input) {
          state.draft = input.draft;
        },
      }),
    }),
  });

  return defineDocumentModelFamily({
    versions: [context.version({ modules: [header, items] })],
    upgradeManifest: {
      documentType: "test/invoice",
      latestVersion: 1,
      supportedVersions: [1],
      upgrades: {},
    },
  }).at(1) as unknown as DocumentModelModule;
}

/** A second, unrelated model, to prove two of them namespace apart. */
function buildLedger(): DocumentModelModule {
  const context = defineDocumentModel({
    id: "test/ledger",
    name: "Ledger",
    description: "A ledger.",
    extension: "ledger",
    version: 1,
    author: { name: "Powerhouse", website: null },
    specifications: {
      global: {
        schema: ph.object("LedgerState", {
          fields: { total: ph.Int({ required: true }) },
        }),
        initialValue: { total: 0 },
      },
      local: { schema: null, initialValue: {} },
    },
  });
  const entries = context.module("entries", {
    operations: ({ global }) => ({
      addAmount: global({
        input: ph.input({ fields: { amount: ph.Int({ required: true }) } }),
        reduce(state, input) {
          state.total += input.amount;
        },
      }),
    }),
  });
  return context.finalize({
    modules: [entries],
  }) as unknown as DocumentModelModule;
}

const INVOICE = buildInvoice();
const INVOICE_AS_STORED = asSchemaFirst(INVOICE);

/** The module with a field added to its stored global state SDL only. */
function withStoredOnlyField(module: DocumentModelModule): DocumentModelModule {
  const documentModel = structuredClone(module.documentModel);
  const state = documentModel.global.specifications.at(-1)!.state.global;
  state.schema = state.schema.replace(
    "type InvoiceState {",
    "type InvoiceState {\n  storedOnly: String",
  );
  return { ...module, documentModel };
}

function servedSchema(module: DocumentModelModule): GraphQLSchema {
  return createSchema(
    [module],
    {},
    generateDocumentModelSchema(module, { useNewApi: true }),
  );
}

function stateFields(schema: GraphQLSchema): readonly string[] {
  return Object.keys(
    (schema.getType("Invoice_InvoiceState") as GraphQLObjectType).getFields(),
  );
}

describe("the host projects a code-first model from its definition", () => {
  const CONTRADICTING = withStoredOnlyField(INVOICE);

  it("serves the definition when the stored SDL disagrees with it", () => {
    const schema = servedSchema(CONTRADICTING);
    expect(stateFields(schema)).toEqual([
      "title",
      "items",
      "groups",
      "annotations",
    ]);
    expect(printSchema(schema)).not.toContain("storedOnly");
  });

  it("serves the stored SDL for the same module without a definition", () => {
    const schema = servedSchema(asSchemaFirst(CONTRADICTING));
    expect(stateFields(schema)).toEqual([
      "storedOnly",
      "title",
      "items",
      "groups",
      "annotations",
    ]);
    expect(
      Object.keys(
        (
          schema.getType("Invoice_InvoiceStateInput") as GraphQLObjectType
        ).getFields(),
      ),
    ).toEqual(["storedOnly", "title", "items", "groups", "annotations"]);
  });
});

describe("both projections describe the same model", () => {
  it("contributes the same host types", () => {
    const structured = print(
      getDocumentModelTypeDefs([INVOICE], EMPTY_TYPEDEFS),
    );
    const stored = print(
      getDocumentModelTypeDefs([INVOICE_AS_STORED], EMPTY_TYPEDEFS),
    );
    expect(structured).toBe(stored);
  });

  for (const useNewApi of [false, true]) {
    it(`builds the same subgraph schema with useNewApi: ${String(useNewApi)}`, () => {
      const structured = generateDocumentModelSchema(INVOICE, { useNewApi });
      const stored = generateDocumentModelSchema(INVOICE_AS_STORED, {
        useNewApi,
      });
      expect(print(structured)).toBe(print(stored));
    });
  }

  it("composes to the same executable schema", () => {
    expect(printSchema(createSchema([INVOICE], {}, EMPTY_TYPEDEFS))).toBe(
      printSchema(createSchema([INVOICE_AS_STORED], {}, EMPTY_TYPEDEFS)),
    );
  });
});

describe("a mixed host", () => {
  it("composes one schema-first and one code-first model together", () => {
    const typeDefs = getDocumentModelTypeDefs(
      [INVOICE, asSchemaFirst(buildLedger())],
      EMPTY_TYPEDEFS,
    );
    const printed = print(typeDefs);
    expect(printed).toContain("type Invoice implements IDocument");
    expect(printed).toContain("type Ledger implements IDocument");
    expect(printed).toContain("Invoice_InvoiceState");
    expect(printed).toContain("Ledger_LedgerState");
    // Both models' types namespace apart, so the assembled host SDL builds.
    expect(() => buildSchema(printed)).not.toThrow();
  });
});

describe("a model that retains a GraphQL AST", () => {
  /**
   * The recorded document includes an object type extension, which the
   * descriptor grammar cannot express. Every definition must reach the host in
   * recorded order.
   */
  const document = {
    kind: "Document" as const,
    definitions: [
      {
        kind: "ScalarTypeDefinition" as const,
        name: { kind: "Name" as const, value: "Ticket" },
        directives: [],
      },
      {
        kind: "ObjectTypeDefinition" as const,
        name: { kind: "Name" as const, value: "CompatState" },
        interfaces: [],
        directives: [],
        fields: [
          {
            kind: "FieldDefinition" as const,
            name: { kind: "Name" as const, value: "label" },
            arguments: [],
            directives: [],
            type: {
              kind: "NonNullType" as const,
              type: {
                kind: "NamedType" as const,
                name: { kind: "Name" as const, value: "String" },
              },
            },
          },
          {
            kind: "FieldDefinition" as const,
            name: { kind: "Name" as const, value: "ticket" },
            arguments: [],
            directives: [],
            type: {
              kind: "NamedType" as const,
              name: { kind: "Name" as const, value: "Ticket" },
            },
          },
        ],
      },
      {
        kind: "ObjectTypeExtension" as const,
        name: { kind: "Name" as const, value: "CompatState" },
        interfaces: [],
        directives: [],
        fields: [
          {
            kind: "FieldDefinition" as const,
            name: { kind: "Name" as const, value: "note" },
            arguments: [],
            directives: [],
            type: {
              kind: "NamedType" as const,
              name: { kind: "Name" as const, value: "String" },
            },
          },
        ],
      },
    ],
  };

  it("projects every recorded definition and extension, in order", () => {
    const projected = printCompatibilityDocument(document, "Compat", new Set());
    const kinds = projected
      .split("\n")
      .filter((line) => /^(scalar|type|extend)/.test(line));
    expect(kinds).toEqual([
      "scalar Ticket",
      "type Compat_CompatState {",
      "extend type Compat_CompatState {",
    ]);
    // The scalar the document declares keeps its name; only the model's own
    // types are namespaced.
    expect(projected).toContain("ticket: Ticket");
    expect(projected).not.toContain("Compat_Ticket");
  });

  it("namespaces the model's root types and keeps the subgraph's own", () => {
    const { definition } = INVOICE as DocumentModelModule & {
      readonly definition: DocumentModelDefinition;
    };
    const latest = definition.specifications.length - 1;
    const stored =
      INVOICE.documentModel.global.specifications.at(-1)!.state.global.schema;
    // A JSON round trip drops the `undefined` keys `parse` leaves, which the
    // closed wire shape rejects.
    const compatibility = JSON.parse(
      JSON.stringify({
        kind: "graphql-ast-v1",
        preserveDefinitionOrder: true,
        document: parse(
          `${stored}\ntype Query { extra: String }\nextend type Query { more: Int }`,
          { noLocation: true },
        ),
      }),
    ) as DocumentModelDefinition["specifications"][number]["graphQLCompatibility"];
    const module = {
      ...INVOICE,
      definition: {
        ...definition,
        specifications: definition.specifications.map((specification, index) =>
          index === latest
            ? { ...specification, graphQLCompatibility: compatibility }
            : specification,
        ),
      },
    } as DocumentModelModule;

    const printed = print(
      getDocumentModelTypeDefs([module], parse("type Query { mine: String }")),
    );
    expect(
      printed
        .match(/(extend )?type \w*Query \{[^}]*\}/g)
        ?.map((block) => block.replace(/\s+/g, " ")),
    ).toEqual([
      "type Invoice_Query { extra: String }",
      "extend type Invoice_Query { more: Int }",
      "type Query { mine: String }",
    ]);
  });
});

function withStoredSdl(
  module: DocumentModelModule,
  stateSdl: string,
  inputSdl: string,
): DocumentModelModule {
  const global = structuredClone(module.documentModel.global);
  const specification = global.specifications.at(-1)!;
  specification.state.global.schema = stateSdl;
  specification.modules[0].operations[0].schema = inputSdl;
  return {
    ...asSchemaFirst(module),
    documentModel: { ...module.documentModel, global },
  } as DocumentModelModule;
}

describe("a retained AST with type extensions", () => {
  const STATE_SDL = [
    "enum ProbeStatus { OPEN }",
    "extend enum ProbeStatus { CLOSED }",
    "type ProbeState { title: String! status: ProbeStatus! }",
    "extend type ProbeState { extra: Int }",
  ].join("\n");
  const INPUT_SDL = [
    "input SetTitleInput { title: String! }",
    "extend input SetTitleInput { note: String }",
  ].join("\n");

  function buildProbe(): DocumentModelModule {
    const ProbeStatus = ph.enum("ProbeStatus", { values: ["OPEN", "CLOSED"] });
    const context = defineDocumentModel({
      id: "test/probe",
      name: "Probe",
      description: "",
      extension: "probe",
      version: 1,
      author: { name: "Powerhouse", website: null },
      specifications: {
        graphQLCompatibility: schemaFirstGraphQLDocument([
          STATE_SDL,
          INPUT_SDL,
        ]),
        global: {
          schema: ph.object("ProbeState", {
            fields: {
              title: ph.String({ required: true }),
              status: ph.ref(ProbeStatus, { required: true }),
              extra: ph.Int(),
            },
          }),
          initialValue: { title: "", status: "OPEN", extra: null },
        },
        local: { schema: null, initialValue: {} },
      },
    });
    const titles = context.module("titles", {
      operations: ({ global }) => ({
        setTitle: global({
          input: ph.input({
            fields: { title: ph.String({ required: true }), note: ph.String() },
          }),
          reduce(state, input) {
            state.title = input.title;
          },
        }),
      }),
    });
    return context.finalize({
      modules: [titles],
    }) as unknown as DocumentModelModule;
  }

  const normalized = (document: DocumentNode) => {
    const byName = <T extends { readonly name: { readonly value: string } }>(
      fields: readonly T[] | undefined,
    ) =>
      [...(fields ?? [])].sort((left, right) =>
        left.name.value.localeCompare(right.name.value),
      );
    return print(
      visit(mergeTypeDefs([document], { sort: true }), {
        ObjectTypeDefinition: (node) => ({
          ...node,
          fields: byName(node.fields),
        }),
        InputObjectTypeDefinition: (node) => ({
          ...node,
          fields: byName(node.fields),
        }),
      }),
    );
  };

  const CODE_FIRST = buildProbe();
  const SCHEMA_FIRST = withStoredSdl(CODE_FIRST, STATE_SDL, INPUT_SDL);

  it("contributes the state types the stored SDL contributes", () => {
    const hostTypes = (module: DocumentModelModule) => {
      const schema = createSchema([module], {}, EMPTY_TYPEDEFS);
      const state = schema.getType("Probe_ProbeState") as GraphQLObjectType;
      const status = schema.getType("Probe_ProbeStatus") as GraphQLEnumType;
      return {
        state: Object.entries(state.getFields()).map(([name, field]) => [
          name,
          String(field.type),
        ]),
        status: status.getValues().map((value) => value.name),
      };
    };
    expect(hostTypes(CODE_FIRST)).toStrictEqual(hostTypes(SCHEMA_FIRST));
    expect(hostTypes(CODE_FIRST)).toStrictEqual({
      state: [
        ["title", "String!"],
        ["status", "Probe_ProbeStatus!"],
        ["extra", "Int"],
      ],
      status: ["OPEN", "CLOSED"],
    });
  });

  for (const useNewApi of [false, true]) {
    it(`builds the subgraph the stored SDL builds with useNewApi: ${String(useNewApi)}`, () => {
      expect(
        normalized(generateDocumentModelSchema(CODE_FIRST, { useNewApi })),
      ).toBe(
        normalized(generateDocumentModelSchema(SCHEMA_FIRST, { useNewApi })),
      );
    });
  }

  it("leaves extension fields out of the initial-state input, as the stored SDL does", () => {
    const printed = print(
      generateDocumentModelSchema(CODE_FIRST, { useNewApi: true }),
    );
    expect(printed.match(/input Probe_ProbeStateInput \{[^}]*\}/)?.[0]).toBe(
      "input Probe_ProbeStateInput {\n  title: String\n  status: Probe_ProbeStatus\n}",
    );
  });

  it("types the initial state as JSONObject when only an extension defines the root, as the stored SDL does", () => {
    const context = defineDocumentModel({
      id: "test/orphan",
      name: "Orphan",
      description: "",
      extension: "orphan",
      version: 1,
      author: { name: "Powerhouse", website: null },
      specifications: {
        graphQLCompatibility: schemaFirstGraphQLDocument([
          "extend type OrphanState { title: String! }",
        ]),
        global: {
          schema: ph.object("OrphanState", {
            fields: { title: ph.String({ required: true }) },
          }),
          initialValue: { title: "" },
        },
        local: { schema: null, initialValue: {} },
      },
    });
    const module = context.finalize({
      modules: [],
    }) as unknown as DocumentModelModule;
    const printed = print(
      generateDocumentModelSchema(module, { useNewApi: true }),
    );
    expect(printed).toContain("global: JSONObject");
    expect(printed).not.toContain("Orphan_OrphanStateInput");
  });
});

describe("a retained AST with types only extensions define", () => {
  const STATE_SDL = [
    "type ProbeState { x: Int! }",
    "extend type Extra { y: Int! }",
  ].join("\n");
  const INPUT_SDL = [
    "extend input Nested { x: Int! }",
    "extend input SetXInput { nested: Nested! }",
  ].join("\n");

  function buildProbe(): DocumentModelModule {
    const Nested = ph.input("Nested", {
      fields: { x: ph.Int({ required: true }) },
    });
    const context = defineDocumentModel({
      id: "test/probe",
      name: "Probe",
      description: "",
      extension: "probe",
      version: 1,
      author: { name: "Powerhouse", website: null },
      specifications: {
        graphQLCompatibility: schemaFirstGraphQLDocument([
          STATE_SDL,
          INPUT_SDL,
        ]),
        auxiliaryTypes: [
          ph.object("Extra", { fields: { y: ph.Int({ required: true }) } }),
        ],
        global: {
          schema: ph.object("ProbeState", {
            fields: { x: ph.Int({ required: true }) },
          }),
          initialValue: { x: 0 },
        },
        local: { schema: null, initialValue: {} },
      },
    });
    const probes = context.module("probes", {
      operations: ({ global }) => ({
        setX: global({
          input: ph.input({
            fields: { nested: ph.ref(Nested, { required: true }) },
          }),
          reduce(state, input) {
            state.x = input.nested.x;
          },
        }),
      }),
    });
    return context.finalize({
      modules: [probes],
    }) as unknown as DocumentModelModule;
  }

  const CODE_FIRST = buildProbe();
  const SCHEMA_FIRST = withStoredSdl(CODE_FIRST, STATE_SDL, INPUT_SDL);

  for (const useNewApi of [false, true]) {
    it(`serves the subgraph the stored SDL serves with useNewApi: ${String(useNewApi)}`, () => {
      const served = (module: DocumentModelModule) => {
        const document = generateDocumentModelSchema(module, { useNewApi });
        return printSchema(createSchema([module], {}, document));
      };
      expect(served(CODE_FIRST)).toBe(served(SCHEMA_FIRST));
      expect(served(CODE_FIRST)).toContain(
        "input Probe_SetXInput {\n  nested: Probe_Nested!\n}",
      );
    });
  }
});

describe("a retained AST whose state field takes an input argument", () => {
  it("keeps the argument's input in the host types", () => {
    const Filter = ph.input("Filter", {
      fields: { term: ph.String({ required: true }) },
    });
    const context = defineDocumentModel({
      id: "test/lookup",
      name: "Lookup",
      description: "",
      extension: "lookup",
      version: 1,
      author: { name: "Powerhouse", website: null },
      specifications: {
        graphQLCompatibility: schemaFirstGraphQLDocument([
          "input Filter { term: String! }",
          "type LookupState { title: String! lookup(filter: Filter): String }",
        ]),
        global: {
          schema: ph.object("LookupState", {
            fields: {
              title: ph.String({ required: true }),
              lookup: ph.field({
                args: { filter: ph.ref(Filter) },
                returns: ph.String(),
              }),
            },
          }),
          initialValue: { title: "" },
        },
        local: { schema: null, initialValue: {} },
      },
    });
    const module = context.finalize({
      modules: [],
    }) as unknown as DocumentModelModule;
    const schema = createSchema([module], {}, EMPTY_TYPEDEFS);
    const lookup = (
      schema.getType("Lookup_LookupState") as GraphQLObjectType
    ).getFields().lookup;
    expect(
      lookup.args.map((arg) => [arg.name, String(arg.type)]),
    ).toStrictEqual([["filter", "Lookup_Filter"]]);
  });
});

describe("a field that declares equals", () => {
  const PATTERN = "[A-Z]{3}";

  function buildCodes(options: {
    readonly equals: boolean;
    readonly retained: boolean;
  }): DocumentModelModule {
    const code = () =>
      ph.String({
        required: true,
        ...(options.equals && { equals: PATTERN }),
      });
    const use = options.equals ? ` @equals(value: "${PATTERN}")` : "";
    const context = defineDocumentModel({
      id: "test/codes",
      name: "Codes",
      description: "",
      extension: "codes",
      version: 1,
      author: { name: "Powerhouse", website: null },
      specifications: {
        ...(options.retained && {
          graphQLCompatibility: schemaFirstGraphQLDocument([
            `type CodesState { code: String!${use} }`,
            `input SetCodeInput { code: String!${use} }`,
          ]),
        }),
        global: {
          schema: ph.object("CodesState", { fields: { code: code() } }),
          initialValue: { code: "ABC" },
        },
        local: { schema: null, initialValue: {} },
      },
    });
    const codes = context.module("codes", {
      operations: ({ global }) => ({
        setCode: global({
          input: ph.input({ fields: { code: code() } }),
          reduce(state, input) {
            state.code = input.code;
          },
        }),
      }),
    });
    return context.finalize({
      modules: [codes],
    }) as unknown as DocumentModelModule;
  }

  for (const retained of [false, true]) {
    for (const useNewApi of [false, true]) {
      it(`serves the schema it serves without equals, retained: ${String(retained)}, useNewApi: ${String(useNewApi)}`, () => {
        const served = (module: DocumentModelModule) =>
          printSchema(
            createSchema(
              [module],
              {},
              generateDocumentModelSchema(module, { useNewApi }),
            ),
          );
        const withEquals = served(buildCodes({ equals: true, retained }));
        expect(withEquals).toBe(
          served(buildCodes({ equals: false, retained })),
        );
        expect(withEquals).toContain(
          "input Codes_SetCodeInput {\n  code: String!\n}",
        );
      });
    }
  }
});

describe("an operation input with default values", () => {
  function buildDefaults(retained = false): DocumentModelModule {
    const Level = ph.enum("Level", { values: ["LOW", "HIGH"] });
    const Point = ph.input("Point", { fields: { x: ph.Int() } });
    const context = defineDocumentModel({
      id: "test/defaults",
      name: "Defaults",
      description: "",
      extension: "defaults",
      version: 1,
      author: { name: "Powerhouse", website: null },
      specifications: {
        ...(retained && {
          graphQLCompatibility: schemaFirstGraphQLDocument([
            "enum Level { LOW HIGH }",
            "type DefaultsState { level: Level count: Int }",
            "input Point { x: Int }",
            'input ConfigureInput { level: Level! = LOW count: Int = 3 tags: [String] = ["a"] origin: Point = { x: 1 } }',
          ]),
        }),
        global: {
          schema: ph.object("DefaultsState", {
            fields: { level: ph.ref(Level), count: ph.Int() },
          }),
          initialValue: { level: null, count: null },
        },
        local: { schema: null, initialValue: {} },
      },
    });
    const settings = context.module("settings", {
      operations: ({ global }) => ({
        configure: global({
          input: ph.input({
            fields: {
              level: ph.ref(Level, { required: true, defaultValue: "LOW" }),
              count: ph.Int({ defaultValue: 3 }),
              tags: ph.list(ph.String(), { defaultValue: ["a"] }),
              origin: ph.ref(Point, { defaultValue: { x: 1 } }),
            },
          }),
          reduce(state, input) {
            state.level = input.level;
            state.count = input.count ?? null;
          },
        }),
      }),
    });
    return context.finalize({
      modules: [settings],
    }) as unknown as DocumentModelModule;
  }

  for (const [retained, useNewApi] of [
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ]) {
    it(`serves the stored SDL's defaults, retained: ${String(retained)}, useNewApi: ${String(useNewApi)}`, () => {
      const served = (module: DocumentModelModule) =>
        printSchema(
          createSchema(
            [module],
            {},
            generateDocumentModelSchema(module, { useNewApi }),
          ),
        );
      const structured = served(buildDefaults(retained));
      expect(structured).toBe(served(asSchemaFirst(buildDefaults(retained))));
      expect(structured).toContain("  level: Defaults_Level! = LOW\n");
    });
  }

  it("leaves the module description out of another subgraph", () => {
    const foreign = printSchema(
      createSchema(
        [buildDefaults(true)],
        {},
        parse(
          "type DefaultsQueries { hello: String }\ntype Query { Defaults: DefaultsQueries }",
        ),
      ),
    );
    expect(foreign).toContain("input Defaults_ConfigureInput {");
    expect(foreign).not.toContain('"""Module:');
  });

  it("fills an omitted enum field from its default", async () => {
    const host = hostFor(buildDefaults());
    const result = await host.run(
      `mutation { Defaults { configure(docId: "doc-1", input: {}) { name } } }`,
    );
    expect(result.errors).toBeUndefined();
    expect(host.state()).toEqual({ level: "LOW", count: 3 });
  });
});
