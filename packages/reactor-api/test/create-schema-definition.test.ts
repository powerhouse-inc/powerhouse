import type {
  DocumentModelDefinition,
  DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import {
  defineDocumentModel,
  defineDocumentModelFamily,
  ph,
} from "document-model";
import {
  buildSchema,
  type DocumentNode,
  type GraphQLObjectType,
  type GraphQLSchema,
  Kind,
  parse,
  print,
} from "graphql";
import { describe, expect, it } from "vitest";
import { printCompatibilityDocument } from "../src/graphql/structured-projection.js";
import {
  createSchema,
  generateDocumentModelSchema,
  getDocumentModelTypeDefs,
} from "../src/utils/create-schema.js";
import { asSchemaFirst, printSchema } from "./utils/graphql-host.js";

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
