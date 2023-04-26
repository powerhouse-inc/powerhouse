import { BudgetStatementDocument } from '../types';

export const submitForReviewOperation = (state: BudgetStatementDocument) => {
    state.data.status = 'Review';
};

export const escalateOperation = (state: BudgetStatementDocument) => {
    state.data.status = 'Escalated';
};

export const approveOperation = (state: BudgetStatementDocument) => {
    state.data.status = 'Final';
};

export const reopenToDraftOperation = (state: BudgetStatementDocument) => {
    state.data.status = 'Draft';
};

export const reopenToReviewOperation = (state: BudgetStatementDocument) => {
    state.data.status = 'Review';
};
