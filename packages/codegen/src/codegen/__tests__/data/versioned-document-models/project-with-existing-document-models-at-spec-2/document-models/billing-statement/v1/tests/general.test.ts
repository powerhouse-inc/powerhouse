import { generateMock } from "@powerhousedao/common";
import {
  editBillingStatement,
  EditBillingStatementInputSchema,
  editContributor,
  EditContributorInputSchema,
  editStatus,
  EditStatusInputSchema,
  isBillingStatementDocument,
  reducer,
  utils,
} from "test/document-models/billing-statement/v1";
import { describe, expect, it } from "vitest";

describe("GeneralOperations", () => {
  it("should handle editBillingStatement operation", () => {
    const document = utils.createDocument();
    const input = generateMock(EditBillingStatementInputSchema());

    const updatedDocument = reducer(document, editBillingStatement(input));

    expect(isBillingStatementDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "EDIT_BILLING_STATEMENT",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle editContributor operation", () => {
    const document = utils.createDocument();
    const input = generateMock(EditContributorInputSchema());

    const updatedDocument = reducer(document, editContributor(input));

    expect(isBillingStatementDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "EDIT_CONTRIBUTOR",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle editStatus operation", () => {
    const document = utils.createDocument();
    const input = generateMock(EditStatusInputSchema());

    const updatedDocument = reducer(document, editStatus(input));

    expect(isBillingStatementDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "EDIT_STATUS",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
});
