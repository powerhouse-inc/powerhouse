/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */
/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import {
  assertIsExpenseReportDocument,
  assertIsExpenseReportState,
  expenseReportDocumentType,
  initialGlobalState,
  initialLocalState,
  isExpenseReportDocument,
  isExpenseReportState,
  utils,
} from "document-models/expense-report/v1";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

describe("ExpenseReport Document Model", () => {
  it("should create a new ExpenseReport document", () => {
    const document = utils.createDocument();

    expect(document).toBeDefined();
    expect(document.header.documentType).toBe(expenseReportDocumentType);
  });

  it("should create a new ExpenseReport document with a valid initial state", () => {
    const document = utils.createDocument();
    expect(document.state.global).toStrictEqual(initialGlobalState);
    expect(document.state.local).toStrictEqual(initialLocalState);
    expect(isExpenseReportDocument(document)).toBe(true);
    expect(isExpenseReportState(document.state)).toBe(true);
  });
  it("should reject a document that is not a ExpenseReport document", () => {
    const wrongDocumentType = utils.createDocument();
    wrongDocumentType.header.documentType = "the-wrong-thing-1234";
    try {
      expect(assertIsExpenseReportDocument(wrongDocumentType)).toThrow();
      expect(isExpenseReportDocument(wrongDocumentType)).toBe(false);
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
    expect(isExpenseReportState(wrongState.state)).toBe(false);
    expect(assertIsExpenseReportState(wrongState.state)).toThrow();
    expect(isExpenseReportDocument(wrongState)).toBe(false);
    expect(assertIsExpenseReportDocument(wrongState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const wrongInitialState = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  wrongInitialState.initialState.global = {
    ...{ notWhat: "you want" },
  };
  try {
    expect(isExpenseReportState(wrongInitialState.state)).toBe(false);
    expect(assertIsExpenseReportState(wrongInitialState.state)).toThrow();
    expect(isExpenseReportDocument(wrongInitialState)).toBe(false);
    expect(assertIsExpenseReportDocument(wrongInitialState)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingIdInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingIdInHeader.header.id;
  try {
    expect(isExpenseReportDocument(missingIdInHeader)).toBe(false);
    expect(assertIsExpenseReportDocument(missingIdInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingNameInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingNameInHeader.header.name;
  try {
    expect(isExpenseReportDocument(missingNameInHeader)).toBe(false);
    expect(assertIsExpenseReportDocument(missingNameInHeader)).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingCreatedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingCreatedAtUtcIsoInHeader.header.createdAtUtcIso;
  try {
    expect(isExpenseReportDocument(missingCreatedAtUtcIsoInHeader)).toBe(false);
    expect(
      assertIsExpenseReportDocument(missingCreatedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }

  const missingLastModifiedAtUtcIsoInHeader = utils.createDocument();
  // @ts-expect-error - we are testing the error case
  delete missingLastModifiedAtUtcIsoInHeader.header.lastModifiedAtUtcIso;
  try {
    expect(isExpenseReportDocument(missingLastModifiedAtUtcIsoInHeader)).toBe(
      false,
    );
    expect(
      assertIsExpenseReportDocument(missingLastModifiedAtUtcIsoInHeader),
    ).toThrow();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
  }
});
