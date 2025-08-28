import {
  driveDocumentModelModule,
  generateDocumentStateQueryFields,
} from "document-drive";
import { describe, it } from "vitest";

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
