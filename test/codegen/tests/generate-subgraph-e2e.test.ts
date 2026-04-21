import { buildSubgraphSchema } from "@apollo/subgraph";
import { generateSubgraph } from "@powerhousedao/codegen";
import { buildTsMorphProject } from "@powerhousedao/codegen/utils";
import { describe, expect, it } from "bun:test";
import type {
  DocumentNode,
  IntrospectionObjectType,
  IntrospectionQuery,
} from "graphql";
import { getIntrospectionQuery, graphql, Kind } from "graphql";
import { gql } from "graphql-tag";
import { join } from "path";
import { DOCUMENT_MODELS, NEW_PROJECT, TEST_OUTPUT } from "../constants.js";
import {
  cpForce,
  getDocumentModelJsonFilePath,
  loadDocumentModelsInDir,
  mkdirRecursive,
  rmForce,
  runTsc,
} from "../utils.js";

const parentOutDir = join(TEST_OUTPUT, "generate-subgraph-e2e");
await rmForce(parentOutDir);
await mkdirRecursive(parentOutDir);

async function generateSubgraphProject(outDirName: string) {
  const outDir = join(parentOutDir, outDirName);
  await cpForce(NEW_PROJECT, outDir);
  // Generate the document model
  await loadDocumentModelsInDir(DOCUMENT_MODELS, outDir);

  // Generate a subgraph for the test-doc model
  const subgraphsDir = join(outDir, "subgraphs");
  const project = buildTsMorphProject(outDir);

  await generateSubgraph(
    "test-doc",
    getDocumentModelJsonFilePath(DOCUMENT_MODELS, "test-doc"),
    project,
  );

  // Compile the generated project — this catches API mismatches in the
  // generated code (e.g. resolvers referencing non-existent properties
  // on BaseSubgraph or IReactorClient).
  await runTsc(outDir);

  return { outDir, subgraphsDir };
}

describe("subgraph e2e integration", () => {
  it("should generate a subgraph that compiles, build a schema from generated typeDefs, and verify via introspection", async () => {
    const { subgraphsDir } = await generateSubgraphProject(
      "schema-introspection",
    );

    // Import the generated schema (only depends on graphql-tag, no project-specific imports)
    const schemaModule = (await import(
      join(subgraphsDir, "test-doc", "schema.ts")
    )) as { schema: DocumentNode };
    const { schema: typeDefs } = schemaModule;

    expect(typeDefs).toBeDefined();
    expect(typeDefs.kind).toBe(Kind.DOCUMENT);

    // Build an executable GraphQL schema from generated typeDefs.
    // The generated schema references types like TestDoc and PHID that are
    // normally provided by reactor-api's createSchema() during composition.
    // We add stub definitions so the schema can be built standalone.
    const stubTypes = gql`
      scalar PHID
      type TestDoc {
        id: String!
        name: String!
        documentType: String!
        state: String
      }
    `;
    const executableSchema = buildSubgraphSchema([
      {
        typeDefs: stubTypes,
        resolvers: {},
      },
      {
        typeDefs,
        resolvers: {
          Query: {
            TestDoc: () => ({}),
          },
        },
      },
    ]);

    // Run an introspection query to validate schema structure
    const introspectionResult = await graphql({
      schema: executableSchema,
      source: getIntrospectionQuery(),
    });

    expect(introspectionResult.errors).toBeUndefined();
    const schemaData = introspectionResult.data!
      .__schema as IntrospectionQuery["__schema"];

    // Verify the schema has expected types
    const typeNames = schemaData.types.map((t) => t.name);
    expect(typeNames).toContain("TestDocQueries");
    expect(typeNames).toContain("Query");
    expect(typeNames).toContain("Mutation");

    // Verify query type fields
    const queryType = schemaData.types.find(
      (t) => t.name === "TestDocQueries",
    ) as IntrospectionObjectType | undefined;
    expect(queryType).toBeDefined();
    const queryFields = queryType!.fields.map((f) => f.name);
    expect(queryFields).toContain("getDocument");
    expect(queryFields).toContain("getDocuments");

    // Verify mutation fields match generated operations
    const mutationType = schemaData.types.find((t) => t.name === "Mutation") as
      | IntrospectionObjectType
      | undefined;
    expect(mutationType).toBeDefined();
    const mutationFields = mutationType!.fields.map((f) => f.name);
    expect(mutationFields).toContain("TestDoc_createDocument");
    expect(mutationFields).toContain("TestDoc_setTestId");
    expect(mutationFields).toContain("TestDoc_setTestName");

    // Verify operation input types were generated
    expect(typeNames).toContain("TestDoc_SetTestIdInput");
    expect(typeNames).toContain("TestDoc_SetTestNameInput");
  });
});
