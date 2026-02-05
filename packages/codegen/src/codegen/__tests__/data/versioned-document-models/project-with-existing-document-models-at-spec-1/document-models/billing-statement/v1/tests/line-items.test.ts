import { generateMock } from "@powerhousedao/common/utils";
import {
  addLineItem,
  AddLineItemInputSchema,
  editLineItem,
  EditLineItemInputSchema,
  isBillingStatementDocument,
  reducer,
  utils,
} from "test/document-models/billing-statement/v1";
import { describe, expect, it } from "vitest";

describe("LineItemsOperations", () => {
  it("should handle addLineItem operation", () => {
    const document = utils.createDocument();
    const input = generateMock(AddLineItemInputSchema());

    const updatedDocument = reducer(document, addLineItem(input));

    expect(isBillingStatementDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "ADD_LINE_ITEM",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle editLineItem operation", () => {
    const document = utils.createDocument();
    const input = generateMock(EditLineItemInputSchema());

    const updatedDocument = reducer(document, editLineItem(input));

    expect(isBillingStatementDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "EDIT_LINE_ITEM",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
});
