import {
    SubmitForReviewAction,
    EscalateAction,
    ApproveAction,
    ReopenAction,
} from '../../gen';
import { BudgetStatement } from '../types';

export const submitForReviewOperation = (
    state: BudgetStatement,
    action: SubmitForReviewAction
): BudgetStatement => {
    return {
        ...state,
        data: {
            ...state.data,
            status: 'Review',
        },
    };
};

export const escalateOperation = (
    state: BudgetStatement,
    action: EscalateAction
) => {
    state.data.status = 'Escalated';
};

export const approveOperation = (
    state: BudgetStatement,
    action: ApproveAction
): BudgetStatement => {
    return {
        ...state,
        data: {
            ...state.data,
            status: 'Final',
        },
    };
};

export const reopenOperation = (
    state: BudgetStatement,
    action: ReopenAction
): BudgetStatement => {
    return {
        ...state,
        data: {
            ...state.data,
            status: state.data.status === 'Final' ? 'Draft' : 'Review',
        },
    };
};
