import { generateMock } from "document-model/mock";
import {
  addEdge,
  AddEdgeInputSchema,
  isWorkflowDocument,
  reducer,
  removeEdge,
  RemoveEdgeInputSchema,
  utils,
} from "document-models/workflow/v1";
import { describe, expect, it } from "vitest";

describe("EdgesOperations", () => {
  it("should handle addEdge operation", () => {
    const document = utils.createDocument();
    const input = generateMock(AddEdgeInputSchema());

    const updatedDocument = reducer(document, addEdge(input));

    expect(isWorkflowDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe("ADD_EDGE");
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle removeEdge operation", () => {
    const document = utils.createDocument();
    const input = generateMock(RemoveEdgeInputSchema());

    const updatedDocument = reducer(document, removeEdge(input));

    expect(isWorkflowDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "REMOVE_EDGE",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
});
