import { describe, it } from "vitest";
import { driveDocumentModelModule } from "../src/drive-document-model/module.js";
import { generateDocumentStateQueryFields } from "../src/utils/graphql.js";

describe("Graphql methods", () => {
  it("should generate document drive query", ({ expect }) => {
    const schema = generateDocumentStateQueryFields(
      driveDocumentModelModule.documentModel,
      "",
    );
    expect(schema).toEqual(
      "name nodes { ... on FolderNode { id name kind parentFolder } ... on FileNode { id name kind documentType parentFolder } } icon",
    );
  });
});
