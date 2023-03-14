import { BudgetStatement } from '../types';

export const submitForReviewOperation = (state: BudgetStatement) => {
    state.data.status = 'Review';
};

export const escalateOperation = (state: BudgetStatement) => {
    state.data.status = 'Escalated';
};

export const approveOperation = (state: BudgetStatement) => {
    state.data.status = 'Final';
};

export const reopenToDraftOperation = (state: BudgetStatement) => {
    state.data.status = 'Draft';
};

export const reopenToReviewOperation = (state: BudgetStatement) => {
    state.data.status = 'Review';
};
