import { BudgetStatement } from '../types';
import {
    ApproveAction,
    EscalateAction,
    ReopenAction,
    SubmitForReviewAction,
} from './types';

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
): BudgetStatement => {
    return {
        ...state,
        data: {
            ...state.data,
            status: 'Escalated',
        },
    };
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
            status: 'Review',
        },
    };
};

export * from './creators';
export * from './types';
