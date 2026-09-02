import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { type DocumentNode, Kind } from "graphql";
import { describe, expect, it } from "vitest";
import {
  buildSubgraphSchemaModule,
  createSchema,
  getDocumentModelTypeDefs,
} from "../src/utils/create-schema.js";

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
