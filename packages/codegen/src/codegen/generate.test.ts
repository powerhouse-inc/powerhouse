import type { DocumentModelGlobalState } from "@powerhousedao/shared/document-model";
import { Project } from "ts-morph";
import { describe, expect, it } from "vitest";
import { generateDocumentModel } from "./generate.js";

const state: DocumentModelGlobalState = {
  id: "powerhouse/test",
  name: "Test",
  extension: "",
  description: "",
  author: { name: "", website: null },
  specifications: [
    {
      version: 1,
      changeLog: [],
      state: {
        global: { schema: "", initialValue: "", examples: [] },
        local: { schema: "", initialValue: "", examples: [] },
      },
      modules: [
        {
          id: "module-1",
          name: "items",
          description: null,
          operations: [
            {
              id: "operation-1",
              name: "SET_NAME",
              description: null,
              errors: [],
              examples: [],
              reducer: null,
              schema: null,
              template: null,
              scope: "global",
            },
          ],
        },
      ],
    },
  ],
};

describe("generateDocumentModel", () => {
  it("refuses a reserved operation name before writing anything", async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    await expect(generateDocumentModel(state, project)).rejects.toThrow(
      'Operation "SET_NAME" in module "items" has a reserved name',
    );
    expect(project.getSourceFiles()).toHaveLength(0);
  });

  it("refuses an operation named RETRACT before writing anything", async () => {
    const retract = structuredClone(state);
    retract.specifications[0].modules[0].operations[0].name = "RETRACT";
    const project = new Project({ useInMemoryFileSystem: true });
    await expect(generateDocumentModel(retract, project)).rejects.toThrow(
      'Operation "RETRACT" in module "items" has a reserved name',
    );
    expect(project.getSourceFiles()).toHaveLength(0);
  });
});
