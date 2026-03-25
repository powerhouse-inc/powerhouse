import { tsMorphGenerateSubgraph } from "@powerhousedao/codegen/file-builders";
import type { DocumentModelGlobalState } from "@powerhousedao/shared/document-model";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  type TestContext,
} from "vitest";
import {
  getTestOutDirPath,
  getTestOutputDir,
  purgeDirAfterTest,
  resetDirForTest,
} from "./utils.js";

const GENERATE_SUBGRAPH_TEST_OUTPUT_DIR = "generate-subgraph";

const testDocModel: DocumentModelGlobalState = {
  id: "powerhouse/test-doc",
  name: "test-doc",
  extension: ".phdm",
  description: "test description",
  author: {
    name: "Powerhouse",
    website: "https://powerhouse.inc",
  },
  specifications: [
    {
      version: 1,
      changeLog: [],
      state: {
        global: {
          schema:
            "type TestDocState {\n  id: Int!\n  name: String!\n  description: String\n  value: String!\n}",
          initialValue:
            '{\n  "id": 0,\n  "name": "",\n  "description": null,\n  "value": ""\n}',
          examples: [],
        },
        local: {
          schema: "",
          initialValue: "",
          examples: [],
        },
      },
      modules: [
        {
          id: "1eb3fcc2-deac-4932-9cf1-077a9c915b64",
          name: "base_operations",
          description: "",
          operations: [
            {
              id: "c4b46f8b-0981-47f7-9bbc-86e998595c97",
              name: "SET_TEST_ID",
              description: "",
              schema: "input SetTestIdInput {\n  id: Int!\n}",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "def9d61b-c6d1-4d3b-89bd-65b22fc36bc6",
              name: "SET_TEST_NAME",
              description: "",
              schema: "input SetTestNameInput {\n  name: String!\n}",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
          ],
        },
      ],
    },
  ],
};

describe("generateSubgraph", () => {
  const testDir = import.meta.dirname;
  const outDirName = getTestOutputDir(
    testDir,
    GENERATE_SUBGRAPH_TEST_OUTPUT_DIR,
  );
  let testOutDirPath: string;

  function setupTest(context: TestContext) {
    testOutDirPath = getTestOutDirPath(context.task.name, outDirName);
  }

  beforeAll(async () => {
    await resetDirForTest(outDirName);
  });

  afterAll(async () => {
    await purgeDirAfterTest(outDirName);
  });

  it(
    "should generate a custom subgraph with correct files",
    { timeout: 30000 },
    async (context) => {
      setupTest(context);
      const subgraphsDir = path.join(testOutDirPath, "subgraphs");

      await tsMorphGenerateSubgraph({
        subgraphsDir,
        subgraphName: "my-custom",
        packageName: "test-pkg",
        documentModel: null,
      });

      // index.ts — base subgraph class
      const indexContent = await readFile(
        path.join(subgraphsDir, "my-custom", "index.ts"),
        "utf-8",
      );
      expect(indexContent).toContain(
        "class MyCustomSubgraph extends BaseSubgraph",
      );
      expect(indexContent).toContain('name = "my-custom"');
      expect(indexContent).toContain("import { schema } from");
      expect(indexContent).toContain("import { getResolvers } from");

      // lib.ts — scaffold
      const libContent = await readFile(
        path.join(subgraphsDir, "my-custom", "lib.ts"),
        "utf-8",
      );
      expect(libContent).toContain("scaffold file meant for customization");

      // schema.ts — custom schema
      const schemaContent = await readFile(
        path.join(subgraphsDir, "my-custom", "schema.ts"),
        "utf-8",
      );
      expect(schemaContent).toContain("import { gql } from");
      expect(schemaContent).toContain("type MyCustomQueries");
      expect(schemaContent).toContain("myCustom: MyCustomQueries!");

      // resolvers.ts — custom resolvers
      const resolversContent = await readFile(
        path.join(subgraphsDir, "my-custom", "resolvers.ts"),
        "utf-8",
      );
      expect(resolversContent).toContain("ISubgraph");
      expect(resolversContent).toContain("subgraph.reactorClient");
      expect(resolversContent).toContain("MyCustomQueries");
      expect(resolversContent).not.toContain("document-drive");
    },
  );

  it(
    "should generate a document-model subgraph with correct files",
    { timeout: 30000 },
    async (context) => {
      setupTest(context);
      const subgraphsDir = path.join(testOutDirPath, "subgraphs");

      await tsMorphGenerateSubgraph({
        subgraphsDir,
        subgraphName: "test-doc",
        packageName: "test-pkg",
        documentModel: testDocModel,
      });

      // index.ts — base subgraph class
      const indexContent = await readFile(
        path.join(subgraphsDir, "test-doc", "index.ts"),
        "utf-8",
      );
      expect(indexContent).toContain(
        "class TestDocSubgraph extends BaseSubgraph",
      );
      expect(indexContent).toContain('name = "test-doc"');

      // schema.ts — generated schema with queries, mutations, and module types
      const schemaContent = await readFile(
        path.join(subgraphsDir, "test-doc", "schema.ts"),
        "utf-8",
      );
      expect(schemaContent).toContain("type TestDocQueries");
      expect(schemaContent).toContain("getDocument(docId: PHID!");
      expect(schemaContent).toContain("getDocuments(driveId: String!)");
      expect(schemaContent).toContain("TestDoc_createDocument(name:String!");
      expect(schemaContent).toContain("TestDoc_setTestId");
      expect(schemaContent).toContain("TestDoc_setTestName");
      // Operation schemas should have prefixed types
      expect(schemaContent).toContain("TestDoc_SetTestIdInput");
      expect(schemaContent).toContain("TestDoc_SetTestNameInput");

      // resolvers.ts — generated resolvers
      const resolversContent = await readFile(
        path.join(subgraphsDir, "test-doc", "resolvers.ts"),
        "utf-8",
      );
      expect(resolversContent).toContain("BaseSubgraph");
      expect(resolversContent).toContain(
        'import { addFile } from "@powerhousedao/shared/document-drive"',
      );
      expect(resolversContent).not.toContain('from "document-drive"');
      expect(resolversContent).toContain(
        'import { setName } from "document-model"',
      );
      expect(resolversContent).toContain(
        'from "test-pkg/document-models/test-doc"',
      );
      expect(resolversContent).toContain("testDocDocumentType");
      expect(resolversContent).toContain("TestDocDocument");
      expect(resolversContent).toContain("TestDoc_createDocument");
      expect(resolversContent).toContain("actions.setTestId");
      expect(resolversContent).toContain("actions.setTestName");
      expect(resolversContent).toContain("SetTestIdInput");
      expect(resolversContent).toContain("SetTestNameInput");
    },
  );

  it(
    "should not overwrite existing custom subgraph files",
    { timeout: 30000 },
    async (context) => {
      setupTest(context);
      const subgraphsDir = path.join(testOutDirPath, "subgraphs");

      // Generate once
      await tsMorphGenerateSubgraph({
        subgraphsDir,
        subgraphName: "idempotent-test",
        packageName: "test-pkg",
        documentModel: null,
      });

      // Read original content
      const originalIndex = await readFile(
        path.join(subgraphsDir, "idempotent-test", "index.ts"),
        "utf-8",
      );

      // Generate again — should not overwrite
      await tsMorphGenerateSubgraph({
        subgraphsDir,
        subgraphName: "idempotent-test",
        packageName: "test-pkg",
        documentModel: null,
      });

      const secondIndex = await readFile(
        path.join(subgraphsDir, "idempotent-test", "index.ts"),
        "utf-8",
      );
      expect(secondIndex).toBe(originalIndex);
    },
  );

  it(
    "should overwrite document-model schema and resolvers on regeneration",
    { timeout: 30000 },
    async (context) => {
      setupTest(context);
      const subgraphsDir = path.join(testOutDirPath, "subgraphs");

      // Generate with document model
      await tsMorphGenerateSubgraph({
        subgraphsDir,
        subgraphName: "force-test",
        packageName: "test-pkg",
        documentModel: testDocModel,
      });

      const schema1 = await readFile(
        path.join(subgraphsDir, "force-test", "schema.ts"),
        "utf-8",
      );
      expect(schema1).toContain("TestDoc");

      // Regenerate — schema and resolvers should be overwritten (force behavior)
      await tsMorphGenerateSubgraph({
        subgraphsDir,
        subgraphName: "force-test",
        packageName: "different-pkg",
        documentModel: testDocModel,
      });

      const schema2 = await readFile(
        path.join(subgraphsDir, "force-test", "schema.ts"),
        "utf-8",
      );
      // Schema content should still be valid
      expect(schema2).toContain("TestDoc");

      // Resolvers should use the new package name
      const resolvers2 = await readFile(
        path.join(subgraphsDir, "force-test", "resolvers.ts"),
        "utf-8",
      );
      expect(resolvers2).toContain("different-pkg/document-models/test-doc");
    },
  );
});
