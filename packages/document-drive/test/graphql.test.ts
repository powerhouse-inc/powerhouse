import { describe, it } from "vitest";
import { generateDocumentStateQueryFields } from "../src/utils/graphql.js";

describe("Graphql methods", () => {
  it("should generate document drive query", ({ expect }) => {
    const schema = generateDocumentStateQueryFields(documentModel);
    expect(schema).toEqual(
      "id name nodes { ... on FolderNode { id name kind parentFolder } ... on FileNode { id name kind documentType parentFolder synchronizationUnits { syncId scope branch } } } icon slug",
    );
  });
});
