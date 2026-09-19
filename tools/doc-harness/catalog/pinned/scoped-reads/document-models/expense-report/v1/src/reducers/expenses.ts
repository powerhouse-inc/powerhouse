import type { ExpenseReportExpensesOperations } from "document-models/expense-report/v1";
import {
  AlreadyApproved,
  DuplicateExpense,
  ExpenseNotFound,
} from "../../gen/expenses/error.js";

export const expenseReportExpensesOperations: ExpenseReportExpensesOperations =
  {
    submitExpenseOperation(state, action) {
      if (state.expenses.some((expense) => expense.id === action.input.id)) {
        throw new DuplicateExpense(`Expense ${action.input.id} already exists`);
      }
      state.expenses.push({
        id: action.input.id,
        memo: action.input.memo,
        amountCents: action.input.amountCents,
        status: "PENDING",
        approvedBy: null,
      });
    },
    approveExpenseOperation(state, action) {
      const expense = state.expenses.find(
        (candidate) => candidate.id === action.input.id,
      );
      if (!expense) {
        throw new ExpenseNotFound(`No expense ${action.input.id}`);
      }
      if (expense.status === "APPROVED") {
        throw new AlreadyApproved(
          `Expense ${action.input.id} is already approved`,
        );
      }
      expense.status = "APPROVED";
      expense.approvedBy = action.context?.signer?.user?.address ?? "anonymous";
    },
  };
