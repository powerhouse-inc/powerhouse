import { generateMock } from "document-model/mock";
import {
  addReviewNote,
  AddReviewNoteInputSchema,
  isExpenseReportDocument,
  reducer,
  utils,
} from "document-models/expense-report/v1";
import { describe, expect, it } from "vitest";

describe("ReviewOperations", () => {
  it("should handle addReviewNote operation", () => {
    const document = utils.createDocument();
    const input = generateMock(AddReviewNoteInputSchema());

    const updatedDocument = reducer(document, addReviewNote(input));

    expect(isExpenseReportDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.local).toHaveLength(1);
    expect(updatedDocument.operations.local[0].action.type).toBe(
      "ADD_REVIEW_NOTE",
    );
    expect(updatedDocument.operations.local[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.local[0].index).toEqual(0);
  });
});
