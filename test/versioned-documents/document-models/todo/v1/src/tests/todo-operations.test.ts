import { generateMock } from "@powerhousedao/codegen";
import { describe, expect, it } from "vitest";
import {
  reducer,
  utils,
  isTodoDocument,
  addTodo,
  removeTodo,
  updateTodo,
  AddTodoInputSchema,
  RemoveTodoInputSchema,
  UpdateTodoInputSchema,
} from "versioned-documents/document-models/todo/v1";

describe("TodoOperationsOperations", () => {
  it("should handle addTodo operation", () => {
    const document = utils.createDocument();
    const input = generateMock(AddTodoInputSchema());

    const updatedDocument = reducer(document, addTodo(input));

    expect(isTodoDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe("ADD_TODO");
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle removeTodo operation", () => {
    const document = utils.createDocument();
    const input = generateMock(RemoveTodoInputSchema());

    const updatedDocument = reducer(document, removeTodo(input));

    expect(isTodoDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "REMOVE_TODO",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle updateTodo operation", () => {
    const document = utils.createDocument();
    const input = generateMock(UpdateTodoInputSchema());

    const updatedDocument = reducer(document, updateTodo(input));

    expect(isTodoDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "UPDATE_TODO",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
});
