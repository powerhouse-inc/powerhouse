import { createAction } from '../../../document';
import {
    SubmitForReviewAction,
    SUBMIT_FOR_REVIEW,
    EscalateAction,
    ESCALATE,
    APPROVE,
    REOPEN_TO_DRAFT,
    REOPEN_TO_REVIEW,
    ApproveAction,
    ReopenToDraftAction,
    ReopenToReviewAction,
} from './types';

export const submitForReview = () =>
    createAction<SubmitForReviewAction>(SUBMIT_FOR_REVIEW);

export const escalate = () => createAction<EscalateAction>(ESCALATE);

export const approve = () => createAction<ApproveAction>(APPROVE);

export const reopenToDraft = () =>
    createAction<ReopenToDraftAction>(REOPEN_TO_DRAFT);

export const reopenToReview = () =>
    createAction<ReopenToReviewAction>(REOPEN_TO_REVIEW);
