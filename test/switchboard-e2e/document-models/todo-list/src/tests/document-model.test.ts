/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */
/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { describe, it, expect } from "vitest";
import {
  utils,
  initialGlobalState,
  initialLocalState,
  todoListDocumentType,
  isTodoListDocument,
  assertIsTodoListDocument,
  isTodoListState,
  assertIsTodoListState,
} from "@powerhousedao/todo-demo/document-models/todo-list";
import { ZodError } from "zod";

describe("TodoList Document Model", () => {
  it("should create a new TodoList document", () => {
    const document = utils.createDocument();

    expect(document).toBeDefined();
    expect(document.header.documentType).toBe(todoListDocumentType);
  });

  it("should create a new TodoList document with a valid initial state", () => {
    const document = utils.createDocument();
    expect(document.state.global).toStrictEqual(initialGlobalState);
    expect(document.state.local).toStrictEqual(initialLocalState);
    expect(isTodoListDocument(document)).toBe(true);
    expect(isTodoListState(document.state)).toBe(true);
  });
  it("should reject a document that is not a TodoList document", () => {
    const wrongDocumentType = utils.createDocument();
    wrongDocumentType.header.documentType = "the-wrong-thing-1234";
    try {
      expect(assertIsTodoListDocument(wrongDocumentType)).toThrow();
      expect(isTodoListDocument(wrongDocumentType)).toBe(false);
    } catch (error) {
      expect(error).toBeInstanceOf(ZodError);
    }
  });
  const wrongState = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  wrongState.state.global = {
    ...{ notWhat: "you want" },
  };
  try {
    expect(isTodoListState(wrongState.state)).toBe(false);
    expect(assertIsTodoListState(wrongState.state)).toThrow();
    expect(isTodoListDocument(wrongState)).toBe(false);
    expect(assertIsTodoListDocument(wrongState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const wrongInitialState = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  wrongInitialState.initialState.global = {
    ...{ notWhat: "you want" },
  };
  try {
    expect(isTodoListState(wrongInitialState.state)).toBe(false);
    expect(assertIsTodoListState(wrongInitialState.state)).toThrow();
    expect(isTodoListDocument(wrongInitialState)).toBe(false);
    expect(assertIsTodoListDocument(wrongInitialState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingIdInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingIdInHeader.header.id;
  try {
    expect(isTodoListDocument(missingIdInHeader)).toBe(false);
    expect(assertIsTodoListDocument(missingIdInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingNameInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingNameInHeader.header.name;
  try {
    expect(isTodoListDocument(missingNameInHeader)).toBe(false);
    expect(assertIsTodoListDocument(missingNameInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingCreatedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingCreatedAtUtcIsoInHeader.header.createdAtUtcIso;
  try {
    expect(isTodoListDocument(missingCreatedAtUtcIsoInHeader)).toBe(false);
    expect(assertIsTodoListDocument(missingCreatedAtUtcIsoInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingLastModifiedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingLastModifiedAtUtcIsoInHeader.header.lastModifiedAtUtcIso;
  try {
    expect(isTodoListDocument(missingLastModifiedAtUtcIsoInHeader)).toBe(false);
    expect(
      assertIsTodoListDocument(missingLastModifiedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }
});
