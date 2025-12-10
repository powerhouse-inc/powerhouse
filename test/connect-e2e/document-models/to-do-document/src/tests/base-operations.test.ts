/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { describe, it, expect } from "vitest";
import { generateMock } from "@powerhousedao/codegen";
import {
  reducer,
  utils,
  isToDoDocumentDocument,
  addTodoItemInput,
  AddTodoItemInputInputSchema,
  updateTodoItemInput,
  UpdateTodoItemInputInputSchema,
  deleteTodoItemInput,
  DeleteTodoItemInputInputSchema,
} from "connect-e2e/document-models/to-do-document";

describe("BaseOperations Operations", () => {
  it("should handle addTodoItemInput operation", () => {
    const document = utils.createDocument();
    const input = generateMock(AddTodoItemInputInputSchema());

    const updatedDocument = reducer(document, addTodoItemInput(input));

    expect(isToDoDocumentDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "ADD_TODO_ITEM_INPUT",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
  it("should handle updateTodoItemInput operation", () => {
    const document = utils.createDocument();
    const input = generateMock(UpdateTodoItemInputInputSchema());

    const updatedDocument = reducer(document, updateTodoItemInput(input));

    expect(isToDoDocumentDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "UPDATE_TODO_ITEM_INPUT",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
  it("should handle deleteTodoItemInput operation", () => {
    const document = utils.createDocument();
    const input = generateMock(DeleteTodoItemInputInputSchema());

    const updatedDocument = reducer(document, deleteTodoItemInput(input));

    expect(isToDoDocumentDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "DELETE_TODO_ITEM_INPUT",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
});
