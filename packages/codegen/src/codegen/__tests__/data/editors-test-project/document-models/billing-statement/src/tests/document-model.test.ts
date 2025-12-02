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
  billingStatementDocumentType,
  isBillingStatementDocument,
  assertIsBillingStatementDocument,
  isBillingStatementState,
  assertIsBillingStatementState,
} from "test/document-models/billing-statement";
import { ZodError } from "zod";

describe("BillingStatement Document Model", () => {
  it("should create a new BillingStatement document", () => {
    const document = utils.createDocument();

    expect(document).toBeDefined();
    expect(document.header.documentType).toBe(billingStatementDocumentType);
  });

  it("should create a new BillingStatement document with a valid initial state", () => {
    const document = utils.createDocument();
    expect(document.state.global).toStrictEqual(initialGlobalState);
    expect(document.state.local).toStrictEqual(initialLocalState);
    expect(isBillingStatementDocument(document)).toBe(true);
    expect(isBillingStatementState(document.state)).toBe(true);
  });
  it("should reject a document that is not a BillingStatement document", () => {
    const wrongDocumentType = utils.createDocument();
    wrongDocumentType.header.documentType = "the-wrong-thing-1234";
    try {
      expect(assertIsBillingStatementDocument(wrongDocumentType)).toThrow();
      expect(isBillingStatementDocument(wrongDocumentType)).toBe(false);
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
    expect(isBillingStatementState(wrongState.state)).toBe(false);
    expect(assertIsBillingStatementState(wrongState.state)).toThrow();
    expect(isBillingStatementDocument(wrongState)).toBe(false);
    expect(assertIsBillingStatementDocument(wrongState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const wrongInitialState = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  wrongInitialState.initialState.global = {
    ...{ notWhat: "you want" },
  };
  try {
    expect(isBillingStatementState(wrongInitialState.state)).toBe(false);
    expect(assertIsBillingStatementState(wrongInitialState.state)).toThrow();
    expect(isBillingStatementDocument(wrongInitialState)).toBe(false);
    expect(assertIsBillingStatementDocument(wrongInitialState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingIdInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingIdInHeader.header.id;
  try {
    expect(isBillingStatementDocument(missingIdInHeader)).toBe(false);
    expect(assertIsBillingStatementDocument(missingIdInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingNameInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingNameInHeader.header.name;
  try {
    expect(isBillingStatementDocument(missingNameInHeader)).toBe(false);
    expect(assertIsBillingStatementDocument(missingNameInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingCreatedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingCreatedAtUtcIsoInHeader.header.createdAtUtcIso;
  try {
    expect(isBillingStatementDocument(missingCreatedAtUtcIsoInHeader)).toBe(
      false,
    );
    expect(
      assertIsBillingStatementDocument(missingCreatedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingLastModifiedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingLastModifiedAtUtcIsoInHeader.header.lastModifiedAtUtcIso;
  try {
    expect(
      isBillingStatementDocument(missingLastModifiedAtUtcIsoInHeader),
    ).toBe(false);
    expect(
      assertIsBillingStatementDocument(missingLastModifiedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }
});
