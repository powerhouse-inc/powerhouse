import { Action } from '../../../document';

export const SUBMIT_FOR_REVIEW = 'SUBMIT_FOR_REVIEW';
export const ESCALATE = 'ESCALATE';
export const APPROVE = 'APPROVE';
export const REOPEN_TO_DRAFT = 'REOPEN_TO_DRAFT';
export const REOPEN_TO_REVIEW = 'REOPEN_TO_REVIEW';

export interface SubmitForReviewAction extends Action {
    type: typeof SUBMIT_FOR_REVIEW;
}

export interface EscalateAction extends Action {
    type: typeof ESCALATE;
}

export interface ApproveAction extends Action {
    type: typeof APPROVE;
}

export interface ReopenToDraftAction extends Action {
    type: typeof REOPEN_TO_DRAFT;
}

export interface ReopenToReviewAction extends Action {
    type: typeof REOPEN_TO_REVIEW;
}

export type BudgetStatementStatusAction =
    | SubmitForReviewAction
    | EscalateAction
    | ApproveAction
    | ReopenToDraftAction
    | ReopenToReviewAction;
