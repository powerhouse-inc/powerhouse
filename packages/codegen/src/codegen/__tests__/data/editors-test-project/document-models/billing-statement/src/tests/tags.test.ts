/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { generateMock } from "@powerhousedao/common/utils";
import {
  editLineItemTag,
  EditLineItemTagInputSchema,
  isBillingStatementDocument,
  reducer,
  utils,
} from "test/document-models/billing-statement";
import { describe, expect, it } from "vitest";

describe("Tags Operations", () => {
  it("should handle editLineItemTag operation", () => {
    const document = utils.createDocument();
    const input = generateMock(EditLineItemTagInputSchema());

    const updatedDocument = reducer(document, editLineItemTag(input));

    expect(isBillingStatementDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "EDIT_LINE_ITEM_TAG",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
});
