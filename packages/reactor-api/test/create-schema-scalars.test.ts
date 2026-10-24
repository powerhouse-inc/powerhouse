import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { scalarCatalog } from "document-model/scalars";
import type * as GraphQL from "graphql";
import { type DocumentNode, Kind, parse } from "graphql";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildSubgraphSchemaModule,
  createSchema,
  getDocumentModelTypeDefs,
  generateDocumentModelSchema,
} from "../src/utils/create-schema.js";

const { graphql, GraphQLScalarType, printSchema } = createRequire(
  import.meta.url,
)("graphql") as typeof GraphQL;

// Regression: state schemas using codegen-only scalars (Unknown, Address)
// referenced undeclared types, excluding the subgraph from composition.

const EMPTY_TYPEDEFS: DocumentNode = { kind: Kind.DOCUMENT, definitions: [] };

function buildModel(name: string, globalSchema: string): DocumentModelModule {
  return {
    documentModel: {
      global: {
        id: name,
        name,
        specifications: [
          {
            modules: [],
            state: {
              global: { schema: globalSchema, initialValue: "" },
              local: { schema: "", initialValue: "" },
            },
          },
        ],
      },
    },
  } as unknown as DocumentModelModule;
}

const MODEL = buildModel(
  "Workflow",
  `
    type WorkflowState {
      name: String!
      config: Unknown!
      filter: Unknown
      owner: Address
    }
  `,
);

function scalarNames(doc: DocumentNode): string[] {
  return doc.definitions
    .filter((def) => def.kind === Kind.SCALAR_TYPE_DEFINITION)
    .map((def) => (def as { name: { value: string } }).name.value);
}

describe("codegen scalars in document model subgraphs", () => {
  it("declares Unknown and Address in the assembled SDL", () => {
    const names = scalarNames(
      getDocumentModelTypeDefs([MODEL], EMPTY_TYPEDEFS),
    );
    expect(names).toContain("Unknown");
    expect(names).toContain("Address");
  });

  it("builds a valid subgraph schema for a model using Unknown", () => {
    const schema = createSchema([MODEL], {}, EMPTY_TYPEDEFS);
    expect(schema.getType("Unknown")).toBeDefined();
    expect(schema.getType("Workflow_WorkflowState")).toBeDefined();
  });

  it("resolves Unknown values as raw JSON", () => {
    const { resolvers } = buildSubgraphSchemaModule(
      [MODEL],
      {},
      EMPTY_TYPEDEFS,
    );
    const unknown = (resolvers as Record<string, unknown>).Unknown as {
      parseValue(value: unknown): unknown;
    };
    expect(unknown.parseValue({ nested: [1, 2] })).toEqual({ nested: [1, 2] });
  });
});

describe("served scalar schema parity", () => {
  const fixture = buildModel(
    "CatalogFixture",
    `
    type CatalogFixtureState {
      amount: Amount
      happenedAt: DateTime
      owner: EthereumAddress
      address: Address
      attachment: AttachmentRef
      metadata: Unknown
    }
  `,
  );
  const customSdl = parse(`
    type Query {
      echoAmount(value: Amount): Amount
      echoObject(value: JSONObject): JSONObject
      echoUnknown(value: Unknown): Unknown
    }
  `);
  const custom = createSchema(
    [],
    {
      Query: {
        echoAmount: (_root: unknown, args: { value?: unknown }) => args.value,
        echoObject: (_root: unknown, args: { value?: unknown }) => args.value,
        echoUnknown: (_root: unknown, args: { value?: unknown }) => args.value,
      },
    },
    customSdl,
  );

  it.each([
    {
      name: "JSONObject",
      source: "query($value: JSONObject) { echoObject(value: $value) }",
      variableValues: { value: [1, 2] },
      message:
        'Variable "$value" got invalid value [1, 2]; Expected type "JSONObject". JSONObject cannot represent non-object value: 1,2',
    },
    {
      name: "JSONObject",
      source: "{ echoObject(value: {nested: BARE}) }",
      variableValues: {},
      message:
        'Expected value of type "JSONObject", found {nested: BARE}; JSONObject cannot represent value: BARE',
    },
    {
      name: "Unknown",
      source: "{ echoUnknown(value: ENUM) }",
      variableValues: {},
      message:
        'Expected value of type "Unknown", found ENUM; JSON cannot represent value: ENUM',
    },
  ])(
    "keeps host coercion over an authored $name resolver for $source",
    async (test) => {
      const resolvers = {
        [test.name]: new GraphQLScalarType({ name: test.name }),
        Query: {
          echoObject: (_root: unknown, args: { value?: unknown }) => args.value,
          echoUnknown: (_root: unknown, args: { value?: unknown }) =>
            args.value,
        },
      };
      const schema = createSchema([], resolvers, customSdl);
      const result = await graphql({
        schema,
        source: test.source,
        variableValues: test.variableValues,
      });

      expect(result.data).toBeUndefined();
      expect(result.errors?.map((error) => error.message)).toEqual([
        test.message,
      ]);
    },
  );

  it("preserves printed document-model SDL", async () => {
    const schema = createSchema([fixture], {}, EMPTY_TYPEDEFS);
    await expect(printSchema(schema)).toMatchFileSnapshot(
      fileURLToPath(
        new URL(
          "./goldens/scalars/document-model.graphql.txt",
          import.meta.url,
        ),
      ),
    );
  });

  it("keeps Amount pass-through", async () => {
    const value = "not an amount";
    const result = await graphql({
      schema: custom,
      source: "query Echo($value: Amount) { echoAmount(value: $value) }",
      variableValues: { value },
    });
    expect(result).toEqual({ data: { echoAmount: value } });
  });

  it("keeps the JSON scalar resolvers", async () => {
    const value = { nested: [1, false, null] };
    const result = await graphql({
      schema: custom,
      source:
        "query Echo($value: JSONObject, $unknown: Unknown) { echoObject(value: $value) echoUnknown(value: $unknown) }",
      variableValues: { value, unknown: [value, "text"] },
    });
    expect(result).toEqual({
      data: { echoObject: value, echoUnknown: [value, "text"] },
    });
  });

  it("refuses non-object JSONObject resolver outputs", async () => {
    const schema = createSchema(
      [],
      { Query: { badObject: () => [1, 2] } },
      parse("type Query { badObject: JSONObject }"),
    );
    const result = await graphql({ schema, source: "{ badObject }" });
    expect(result.data).toEqual({ badObject: null });
    expect(
      result.errors?.map(({ message, path }) => ({ message, path })),
    ).toEqual([
      {
        message: "JSONObject cannot represent non-object value: 1,2",
        path: ["badObject"],
      },
    ]);
  });
});

describe("standalone model scalar declarations", () => {
  it("emits the catalog prelude for the model API", () => {
    const document = generateDocumentModelSchema(MODEL.documentModel.global, {
      useNewApi: true,
    });
    expect(scalarNames(document).sort()).toEqual(
      scalarCatalog.map(({ name }) => name).sort(),
    );
  });
});
