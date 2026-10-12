import { createRequire } from "node:module";
import type { IReactorClient } from "@powerhousedao/reactor";
import {
  createReactorDriveResolvers,
  REACTOR_DRIVE_DOCUMENT_TYPE,
  reactorDriveDocumentModelModule,
  reactorDriveSubgraphTypeDefs,
} from "@powerhousedao/reactor-drive";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import type * as GraphQL from "graphql";
import type { GraphQLObjectType, GraphQLSchema } from "graphql";
import { gql } from "graphql-tag";
import { describe, expect, it } from "vitest";
import { createSchema } from "../src/utils/create-schema.js";

// The CommonJS build @apollo/subgraph uses; vite would hand this file the ESM one.
const { execute, parse, validate } = createRequire(import.meta.url)(
  "graphql",
) as typeof GraphQL;

const DRIVE_ID = "drive-1";

/** The models switchboard always registers (switchboardBaseDocumentModels). */
const baseModels = [
  driveDocumentModelModule,
  reactorDriveDocumentModelModule,
] as unknown as DocumentModelModule[];

function fakeReactorClient(): IReactorClient {
  return {
    get: () =>
      Promise.resolve({
        header: { id: DRIVE_ID, documentType: REACTOR_DRIVE_DOCUMENT_TYPE },
        state: {
          global: { name: "My Drive", icon: null },
          local: { sharingType: "private", availableOffline: false },
        },
      }),
    isServed: () => Promise.resolve(true),
  } as unknown as IReactorClient;
}

function fakeReadModel() {
  return {
    listChildren: () =>
      Promise.resolve({
        results: [
          {
            kind: "file",
            id: "file-1",
            driveId: DRIVE_ID,
            name: "a.txt",
            parentFolder: null,
            documentType: "powerhouse/text",
          },
        ],
        options: { cursor: "", limit: 100 },
        nextCursor: undefined,
      }),
    getNode: () => Promise.resolve(undefined),
    getDescendants: () => Promise.resolve([]),
  } as unknown as NonNullable<
    Parameters<typeof createReactorDriveResolvers>[0]
  >["readModel"];
}

/** The reactor-drive subgraph schema as GraphQLManager builds it. */
function buildReactorDriveSubgraphSchema(): GraphQLSchema {
  const resolvers = createReactorDriveResolvers({
    reactorClient: fakeReactorClient(),
    readModel: fakeReadModel(),
    hostCanRead: () => Promise.resolve(true),
  });
  return createSchema(
    baseModels,
    resolvers as unknown as Parameters<typeof createSchema>[1],
    reactorDriveSubgraphTypeDefs,
  );
}

const ROOT_NODES_QUERY = `{
  reactorDrive(id: "${DRIVE_ID}") {
    id
    name
    rootNodes {
      hasMore
      results {
        __typename
        ... on ReactorDriveFileNode { id name }
      }
    }
  }
}`;

describe("reactor-drive subgraph assembled with the document-model typedefs", () => {
  it("builds the schema with the real resolvers", () => {
    expect(() => buildReactorDriveSubgraphSchema()).not.toThrow();
  });

  it("validates reactorDrive { rootNodes }", () => {
    const schema = buildReactorDriveSubgraphSchema();
    const errors = validate(schema, parse(ROOT_NODES_QUERY));
    expect(errors.map((e) => e.message)).toEqual([]);
  });

  it("resolves reactorDrive { rootNodes } through the real resolvers", async () => {
    const schema = buildReactorDriveSubgraphSchema();
    const document = parse(ROOT_NODES_QUERY);
    const validationErrors = validate(schema, document);
    expect(validationErrors.map((e) => e.message)).toEqual([]);

    const result = await execute({ schema, document, contextValue: {} });
    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      reactorDrive: {
        id: DRIVE_ID,
        name: "My Drive",
        rootNodes: {
          hasMore: false,
          results: [
            { __typename: "ReactorDriveFileNode", id: "file-1", name: "a.txt" },
          ],
        },
      },
    });
  });
});

describe("a subgraph type named like a generated document-model type", () => {
  function widgetModel(): DocumentModelModule {
    return {
      documentModel: {
        global: {
          id: "test/widget",
          name: "Widget",
          specifications: [
            {
              version: 1,
              modules: [],
              state: {
                global: { schema: "type WidgetState { label: String }" },
                local: { schema: "" },
              },
            },
          ],
        },
      },
    } as unknown as DocumentModelModule;
  }

  const widgetSubgraphTypeDefs = gql`
    type Widget {
      inventory: Int!
    }
    type Operation {
      custom: String
    }
    type Query {
      widget: Widget
      operation: Operation
    }
  `;

  function buildWidgetSchema() {
    return createSchema(
      [...baseModels, widgetModel()],
      {
        Query: {
          widget: () => ({ inventory: 3 }),
          operation: () => ({ custom: "x" }),
        },
      },
      widgetSubgraphTypeDefs,
    );
  }

  function fieldsOf(schema: GraphQLSchema, typeName: string): string[] {
    const type = schema.getType(typeName) as GraphQLObjectType | undefined;
    return Object.keys(type?.getFields() ?? {});
  }

  // Characterization of main: documents the silent drop; passes today.
  it("CURRENT BEHAVIOR: the subgraph's definitions are dropped without an error", () => {
    const schema = buildWidgetSchema();
    expect(fieldsOf(schema, "Widget")).not.toContain("inventory");
    expect(fieldsOf(schema, "Widget")).toContain("documentType");
    expect(fieldsOf(schema, "Operation")).not.toContain("custom");
  });

  it("never drops the subgraph's own type silently (keeps it or refuses the schema)", () => {
    let schema: GraphQLSchema | undefined;
    try {
      schema = buildWidgetSchema();
    } catch {
      // Refusing the colliding schema is an acceptable fix.
      return;
    }
    expect(fieldsOf(schema, "Widget")).toContain("inventory");
    expect(fieldsOf(schema, "Operation")).toContain("custom");
  });
});
