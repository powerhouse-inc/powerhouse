import { Action } from '../../../document';

export const SUBMIT_FOR_REVIEW = 'SUBMIT_FOR_REVIEW';
export const ESCALATE = 'ESCALATE';
export const APPROVE = 'APPROVE';
export const REOPEN = 'REOPEN';

export interface SubmitForReviewAction extends Action {
    type: typeof SUBMIT_FOR_REVIEW;
}

export interface EscalateAction extends Action {
    type: typeof ESCALATE;
}

export interface ApproveAction extends Action {
    type: typeof APPROVE;
}

export interface ReopenAction extends Action {
    type: typeof REOPEN;
}

export type BudgetStatementStatusAction =
    | SubmitForReviewAction
    | EscalateAction
    | ApproveAction
    | ReopenAction;
