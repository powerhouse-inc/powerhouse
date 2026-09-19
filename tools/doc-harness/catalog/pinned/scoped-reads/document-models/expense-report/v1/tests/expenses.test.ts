import { generateMock } from "document-model/mock";
import {
  approveExpense,
  ApproveExpenseInputSchema,
  isExpenseReportDocument,
  reducer,
  submitExpense,
  SubmitExpenseInputSchema,
  utils,
} from "document-models/expense-report/v1";
import { describe, expect, it } from "vitest";

describe("ExpensesOperations", () => {
  it("should handle submitExpense operation", () => {
    const document = utils.createDocument();
    const input = generateMock(SubmitExpenseInputSchema());

    const updatedDocument = reducer(document, submitExpense(input));

    expect(isExpenseReportDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "SUBMIT_EXPENSE",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle approveExpense operation", () => {
    const document = utils.createDocument();
    const input = generateMock(ApproveExpenseInputSchema());

    const updatedDocument = reducer(document, approveExpense(input));

    expect(isExpenseReportDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "APPROVE_EXPENSE",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
});
