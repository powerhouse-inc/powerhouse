/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */
/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import {
  assertIsReactorGroupDocument,
  assertIsReactorGroupState,
  initialGlobalState,
  initialLocalState,
  isReactorGroupDocument,
  isReactorGroupState,
  reactorGroupDocumentType,
  utils,
} from "document-models/reactor-group/v1";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

describe("ReactorGroup Document Model", () => {
  it("should create a new ReactorGroup document", () => {
    const document = utils.createDocument();

    expect(document).toBeDefined();
    expect(document.header.documentType).toBe(reactorGroupDocumentType);
  });

  it("should create a new ReactorGroup document with a valid initial state", () => {
    const document = utils.createDocument();
    expect(document.state.global).toStrictEqual(initialGlobalState);
    expect(document.state.local).toStrictEqual(initialLocalState);
    expect(isReactorGroupDocument(document)).toBe(true);
    expect(isReactorGroupState(document.state)).toBe(true);
  });
  it("should reject a document that is not a ReactorGroup document", () => {
    const wrongDocumentType = utils.createDocument();
    wrongDocumentType.header.documentType = "the-wrong-thing-1234";
    try {
      expect(assertIsReactorGroupDocument(wrongDocumentType)).toThrow();
      expect(isReactorGroupDocument(wrongDocumentType)).toBe(false);
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
    expect(isReactorGroupState(wrongState.state)).toBe(false);
    expect(assertIsReactorGroupState(wrongState.state)).toThrow();
    expect(isReactorGroupDocument(wrongState)).toBe(false);
    expect(assertIsReactorGroupDocument(wrongState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const wrongInitialState = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  wrongInitialState.initialState.global = {
    ...{ notWhat: "you want" },
  };
  try {
    expect(isReactorGroupState(wrongInitialState.state)).toBe(false);
    expect(assertIsReactorGroupState(wrongInitialState.state)).toThrow();
    expect(isReactorGroupDocument(wrongInitialState)).toBe(false);
    expect(assertIsReactorGroupDocument(wrongInitialState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingIdInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingIdInHeader.header.id;
  try {
    expect(isReactorGroupDocument(missingIdInHeader)).toBe(false);
    expect(assertIsReactorGroupDocument(missingIdInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingNameInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingNameInHeader.header.name;
  try {
    expect(isReactorGroupDocument(missingNameInHeader)).toBe(false);
    expect(assertIsReactorGroupDocument(missingNameInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingCreatedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingCreatedAtUtcIsoInHeader.header.createdAtUtcIso;
  try {
    expect(isReactorGroupDocument(missingCreatedAtUtcIsoInHeader)).toBe(false);
    expect(
      assertIsReactorGroupDocument(missingCreatedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingLastModifiedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingLastModifiedAtUtcIsoInHeader.header.lastModifiedAtUtcIso;
  try {
    expect(isReactorGroupDocument(missingLastModifiedAtUtcIsoInHeader)).toBe(
      false,
    );
    expect(
      assertIsReactorGroupDocument(missingLastModifiedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }
});
