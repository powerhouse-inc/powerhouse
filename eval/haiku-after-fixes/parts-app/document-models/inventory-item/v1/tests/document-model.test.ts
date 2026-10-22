/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */
/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import {
  assertIsInventoryItemDocument,
  assertIsInventoryItemState,
  initialGlobalState,
  initialLocalState,
  inventoryItemDocumentType,
  isInventoryItemDocument,
  isInventoryItemState,
  utils,
} from "document-models/inventory-item/v1";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

describe("InventoryItem Document Model", () => {
  it("should create a new InventoryItem document", () => {
    const document = utils.createDocument();

    expect(document).toBeDefined();
    expect(document.header.documentType).toBe(inventoryItemDocumentType);
  });

  it("should create a new InventoryItem document with a valid initial state", () => {
    const document = utils.createDocument();
    expect(document.state.global).toStrictEqual(initialGlobalState);
    expect(document.state.local).toStrictEqual(initialLocalState);
    expect(isInventoryItemDocument(document)).toBe(true);
    expect(isInventoryItemState(document.state)).toBe(true);
  });
  it("should reject a document that is not a InventoryItem document", () => {
    const wrongDocumentType = utils.createDocument();
    wrongDocumentType.header.documentType = "the-wrong-thing-1234";
    try {
      expect(assertIsInventoryItemDocument(wrongDocumentType)).toThrow();
      expect(isInventoryItemDocument(wrongDocumentType)).toBe(false);
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
    expect(isInventoryItemState(wrongState.state)).toBe(false);
    expect(assertIsInventoryItemState(wrongState.state)).toThrow();
    expect(isInventoryItemDocument(wrongState)).toBe(false);
    expect(assertIsInventoryItemDocument(wrongState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const wrongInitialState = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  wrongInitialState.initialState.global = {
    ...{ notWhat: "you want" },
  };
  try {
    expect(isInventoryItemState(wrongInitialState.state)).toBe(false);
    expect(assertIsInventoryItemState(wrongInitialState.state)).toThrow();
    expect(isInventoryItemDocument(wrongInitialState)).toBe(false);
    expect(assertIsInventoryItemDocument(wrongInitialState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingIdInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingIdInHeader.header.id;
  try {
    expect(isInventoryItemDocument(missingIdInHeader)).toBe(false);
    expect(assertIsInventoryItemDocument(missingIdInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingNameInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingNameInHeader.header.name;
  try {
    expect(isInventoryItemDocument(missingNameInHeader)).toBe(false);
    expect(assertIsInventoryItemDocument(missingNameInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingCreatedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingCreatedAtUtcIsoInHeader.header.createdAtUtcIso;
  try {
    expect(isInventoryItemDocument(missingCreatedAtUtcIsoInHeader)).toBe(false);
    expect(
      assertIsInventoryItemDocument(missingCreatedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingLastModifiedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingLastModifiedAtUtcIsoInHeader.header.lastModifiedAtUtcIso;
  try {
    expect(isInventoryItemDocument(missingLastModifiedAtUtcIsoInHeader)).toBe(
      false,
    );
    expect(
      assertIsInventoryItemDocument(missingLastModifiedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }
});
