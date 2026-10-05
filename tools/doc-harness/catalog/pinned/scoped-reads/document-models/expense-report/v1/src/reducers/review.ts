import type { ExpenseReportReviewOperations } from "document-models/expense-report/v1";

export const expenseReportReviewOperations: ExpenseReportReviewOperations = {
  addReviewNoteOperation(state, action) {
    state.reviewNotes.push({
      expenseId: action.input.expenseId,
      note: action.input.note,
    });
  },
};
