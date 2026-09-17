/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */
/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import {
  assertIsConnectionDocument,
  assertIsConnectionState,
  connectionDocumentType,
  initialGlobalState,
  initialLocalState,
  isConnectionDocument,
  isConnectionState,
  utils,
} from "document-models/connection/v1";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

describe("Connection Document Model", () => {
  it("should create a new Connection document", () => {
    const document = utils.createDocument();

    expect(document).toBeDefined();
    expect(document.header.documentType).toBe(connectionDocumentType);
  });

  it("should create a new Connection document with a valid initial state", () => {
    const document = utils.createDocument();
    expect(document.state.global).toStrictEqual(initialGlobalState);
    expect(document.state.local).toStrictEqual(initialLocalState);
    expect(isConnectionDocument(document)).toBe(true);
    expect(isConnectionState(document.state)).toBe(true);
  });
  it("should reject a document that is not a Connection document", () => {
    const wrongDocumentType = utils.createDocument();
    wrongDocumentType.header.documentType = "the-wrong-thing-1234";
    try {
      expect(assertIsConnectionDocument(wrongDocumentType)).toThrow();
      expect(isConnectionDocument(wrongDocumentType)).toBe(false);
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
    expect(isConnectionState(wrongState.state)).toBe(false);
    expect(assertIsConnectionState(wrongState.state)).toThrow();
    expect(isConnectionDocument(wrongState)).toBe(false);
    expect(assertIsConnectionDocument(wrongState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const wrongInitialState = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  wrongInitialState.initialState.global = {
    ...{ notWhat: "you want" },
  };
  try {
    expect(isConnectionState(wrongInitialState.state)).toBe(false);
    expect(assertIsConnectionState(wrongInitialState.state)).toThrow();
    expect(isConnectionDocument(wrongInitialState)).toBe(false);
    expect(assertIsConnectionDocument(wrongInitialState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingIdInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingIdInHeader.header.id;
  try {
    expect(isConnectionDocument(missingIdInHeader)).toBe(false);
    expect(assertIsConnectionDocument(missingIdInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingNameInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingNameInHeader.header.name;
  try {
    expect(isConnectionDocument(missingNameInHeader)).toBe(false);
    expect(assertIsConnectionDocument(missingNameInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingCreatedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingCreatedAtUtcIsoInHeader.header.createdAtUtcIso;
  try {
    expect(isConnectionDocument(missingCreatedAtUtcIsoInHeader)).toBe(false);
    expect(
      assertIsConnectionDocument(missingCreatedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingLastModifiedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingLastModifiedAtUtcIsoInHeader.header.lastModifiedAtUtcIso;
  try {
    expect(isConnectionDocument(missingLastModifiedAtUtcIsoInHeader)).toBe(
      false,
    );
    expect(
      assertIsConnectionDocument(missingLastModifiedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }
});
