import { loadDocumentModel } from "@powerhousedao/codegen";
import { tsMorphGenerateSubgraph } from "@powerhousedao/codegen/file-builders";
import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  NEW_PROJECT,
  TEST_OUTPUT,
  TEST_PROJECTS,
  WITH_DOCUMENT_MODELS_SPEC_2,
} from "../constants.js";
import { cpForce, mkdirRecursive, rmForce, runTsc } from "../utils.js";

const cwd = process.cwd();
const parentOutDir = join(cwd, TEST_OUTPUT, "generate-subgraph");
const testProjectsDir = join(cwd, TEST_PROJECTS);
await rmForce(parentOutDir);
await mkdirRecursive(parentOutDir);

describe("generateSubgraph", () => {
  it("should generate a custom subgraph with correct files", async () => {
    const outDir = join(parentOutDir, "generate-custom-subgraph");
    await cpForce(join(testProjectsDir, WITH_DOCUMENT_MODELS_SPEC_2), outDir);
    const subgraphsDir = join(outDir, "subgraphs");

    await tsMorphGenerateSubgraph({
      subgraphsDir,
      subgraphName: "my-custom",
      documentModel: null,
    });

    await runTsc(outDir);

    // index.ts — base subgraph class
    const indexContent = await readFile(
      join(subgraphsDir, "my-custom", "index.ts"),
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
      join(subgraphsDir, "my-custom", "lib.ts"),
      "utf-8",
    );
    expect(libContent).toContain("scaffold file meant for customization");

    // schema.ts — custom schema
    const schemaContent = await readFile(
      join(subgraphsDir, "my-custom", "schema.ts"),
      "utf-8",
    );
    expect(schemaContent).toContain("import { gql } from");
    expect(schemaContent).toContain("type MyCustomQueries");
    expect(schemaContent).toContain("myCustom: MyCustomQueries!");

    // resolvers.ts — custom resolvers
    const resolversContent = await readFile(
      join(subgraphsDir, "my-custom", "resolvers.ts"),
      "utf-8",
    );
    expect(resolversContent).toContain("ISubgraph");
    expect(resolversContent).toContain("subgraph.reactorClient");
    expect(resolversContent).toContain("MyCustomQueries");
    expect(resolversContent).not.toContain("document-drive");
  });

  it("should generate a document-model subgraph with correct files", async () => {
    const outDir = join(parentOutDir, "generate-document-model-subgraph");
    await cpForce(join(testProjectsDir, WITH_DOCUMENT_MODELS_SPEC_2), outDir);
    const subgraphsDir = join(outDir, "subgraphs");
    const documentModelsDir = join(outDir, "document-models");
    const documentModel = await loadDocumentModel(
      join(documentModelsDir, "test-doc", "test-doc.json"),
    );

    await tsMorphGenerateSubgraph({
      subgraphsDir,
      subgraphName: "test-doc",
      documentModel,
    });

    await runTsc(outDir);

    // index.ts — base subgraph class
    const indexContent = await readFile(
      join(subgraphsDir, "test-doc", "index.ts"),
      "utf-8",
    );
    expect(indexContent).toContain(
      "class TestDocSubgraph extends BaseSubgraph",
    );
    expect(indexContent).toContain('name = "test-doc"');

    // schema.ts — generated schema with queries, mutations, and module types
    const schemaContent = await readFile(
      join(subgraphsDir, "test-doc", "schema.ts"),
      "utf-8",
    );
    expect(schemaContent).toContain("type TestDocQueries");
    expect(schemaContent).toContain("getDocument(docId: PHID!");
    expect(schemaContent).toContain("getDocuments(driveId: String)");
    expect(schemaContent).toContain("TestDoc_createDocument(name:String!");
    expect(schemaContent).toContain("TestDoc_setTestId");
    expect(schemaContent).toContain("TestDoc_setTestName");
    // Operation schemas should have prefixed types
    expect(schemaContent).toContain("TestDoc_SetTestIdInput");
    expect(schemaContent).toContain("TestDoc_SetTestNameInput");

    // resolvers.ts — generated resolvers
    const resolversContent = await readFile(
      join(subgraphsDir, "test-doc", "resolvers.ts"),
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
    expect(resolversContent).toContain('from "document-models/test-doc"');
    expect(resolversContent).toContain("testDocDocumentType");
    expect(resolversContent).toContain("TestDocDocument");
    expect(resolversContent).toContain("TestDoc_createDocument");
    expect(resolversContent).toContain("actions.setTestId");
    expect(resolversContent).toContain("actions.setTestName");
    expect(resolversContent).toContain("SetTestIdInput");
    expect(resolversContent).toContain("SetTestNameInput");
  });

  it("should not overwrite existing custom subgraph files", async () => {
    const outDir = join(parentOutDir, "do-not-overwrite-other-subgraphs");
    await cpForce(join(testProjectsDir, NEW_PROJECT), outDir);
    const subgraphsDir = join(outDir, "subgraphs");

    // Generate once
    await tsMorphGenerateSubgraph({
      subgraphsDir,
      subgraphName: "idempotent-test",
      documentModel: null,
    });

    await runTsc(outDir);

    // Read original content
    const originalIndex = await readFile(
      join(subgraphsDir, "idempotent-test", "index.ts"),
      "utf-8",
    );

    // Generate again — should not overwrite
    await tsMorphGenerateSubgraph({
      subgraphsDir,
      subgraphName: "idempotent-test",
      documentModel: null,
    });

    const secondIndex = await readFile(
      join(subgraphsDir, "idempotent-test", "index.ts"),
      "utf-8",
    );
    expect(secondIndex).toBe(originalIndex);
  });

  it("should overwrite document-model schema and resolvers on regeneration", async () => {
    const outDir = join(
      parentOutDir,
      "should-overwrite-schemas-and-resolvers-on-regneration",
    );
    await cpForce(join(testProjectsDir, WITH_DOCUMENT_MODELS_SPEC_2), outDir);
    const subgraphsDir = join(outDir, "subgraphs");
    const documentModelsDir = join(outDir, "document-models");
    const documentModel = await loadDocumentModel(
      join(documentModelsDir, "test-doc", "test-doc.json"),
    );

    // Generate with document model
    await tsMorphGenerateSubgraph({
      subgraphsDir,
      subgraphName: "force-test",
      documentModel,
    });

    const schema1 = await readFile(
      join(subgraphsDir, "force-test", "schema.ts"),
      "utf-8",
    );
    expect(schema1).toContain("TestDoc");

    // Regenerate — schema and resolvers should be overwritten (force behavior)
    await tsMorphGenerateSubgraph({
      subgraphsDir,
      subgraphName: "force-test",
      documentModel,
    });

    await runTsc(outDir);

    const schema2 = await readFile(
      join(subgraphsDir, "force-test", "schema.ts"),
      "utf-8",
    );
    // Schema content should still be valid
    expect(schema2).toContain("TestDoc");

    // Resolvers should use the new package name
    const resolvers2 = await readFile(
      join(subgraphsDir, "force-test", "resolvers.ts"),
      "utf-8",
    );
    expect(resolvers2).toContain("document-models/test-doc");
  });
});
