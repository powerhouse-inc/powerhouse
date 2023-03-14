import { createAction } from '../../../document';
import {
    APPROVE,
    ApproveAction,
    ESCALATE,
    EscalateAction,
    ReopenToDraftAction,
    ReopenToReviewAction,
    REOPEN_TO_DRAFT,
    REOPEN_TO_REVIEW,
    SubmitForReviewAction,
    SUBMIT_FOR_REVIEW,
} from './types';

export const submitForReview = () =>
    createAction<SubmitForReviewAction>(SUBMIT_FOR_REVIEW);

export const escalate = () => createAction<EscalateAction>(ESCALATE);

export const approve = () => createAction<ApproveAction>(APPROVE);

export const reopenToDraft = () =>
    createAction<ReopenToDraftAction>(REOPEN_TO_DRAFT);

export const reopenToReview = () =>
    createAction<ReopenToReviewAction>(REOPEN_TO_REVIEW);
