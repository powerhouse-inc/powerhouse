/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */
/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import {
  assertIsChatSessionDocument,
  assertIsChatSessionState,
  chatSessionDocumentType,
  initialGlobalState,
  initialLocalState,
  isChatSessionDocument,
  isChatSessionState,
  utils,
} from "document-models/chat-session/v1";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

describe("ChatSession Document Model", () => {
  it("should create a new ChatSession document", () => {
    const document = utils.createDocument();

    expect(document).toBeDefined();
    expect(document.header.documentType).toBe(chatSessionDocumentType);
  });

  it("should create a new ChatSession document with a valid initial state", () => {
    const document = utils.createDocument();
    expect(document.state.global).toStrictEqual(initialGlobalState);
    expect(document.state.local).toStrictEqual(initialLocalState);
    expect(isChatSessionDocument(document)).toBe(true);
    expect(isChatSessionState(document.state)).toBe(true);
  });
  it("should reject a document that is not a ChatSession document", () => {
    const wrongDocumentType = utils.createDocument();
    wrongDocumentType.header.documentType = "the-wrong-thing-1234";
    try {
      expect(assertIsChatSessionDocument(wrongDocumentType)).toThrow();
      expect(isChatSessionDocument(wrongDocumentType)).toBe(false);
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
    expect(isChatSessionState(wrongState.state)).toBe(false);
    expect(assertIsChatSessionState(wrongState.state)).toThrow();
    expect(isChatSessionDocument(wrongState)).toBe(false);
    expect(assertIsChatSessionDocument(wrongState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const wrongInitialState = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  wrongInitialState.initialState.global = {
    ...{ notWhat: "you want" },
  };
  try {
    expect(isChatSessionState(wrongInitialState.state)).toBe(false);
    expect(assertIsChatSessionState(wrongInitialState.state)).toThrow();
    expect(isChatSessionDocument(wrongInitialState)).toBe(false);
    expect(assertIsChatSessionDocument(wrongInitialState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingIdInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingIdInHeader.header.id;
  try {
    expect(isChatSessionDocument(missingIdInHeader)).toBe(false);
    expect(assertIsChatSessionDocument(missingIdInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingNameInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingNameInHeader.header.name;
  try {
    expect(isChatSessionDocument(missingNameInHeader)).toBe(false);
    expect(assertIsChatSessionDocument(missingNameInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingCreatedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingCreatedAtUtcIsoInHeader.header.createdAtUtcIso;
  try {
    expect(isChatSessionDocument(missingCreatedAtUtcIsoInHeader)).toBe(false);
    expect(
      assertIsChatSessionDocument(missingCreatedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingLastModifiedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingLastModifiedAtUtcIsoInHeader.header.lastModifiedAtUtcIso;
  try {
    expect(isChatSessionDocument(missingLastModifiedAtUtcIsoInHeader)).toBe(
      false,
    );
    expect(
      assertIsChatSessionDocument(missingLastModifiedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }
});
