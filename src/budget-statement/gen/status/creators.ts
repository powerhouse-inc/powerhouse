import { createAction } from '../../../document';
import {
    SubmitForReviewAction,
    SUBMIT_FOR_REVIEW,
    EscalateAction,
    ESCALATE,
    APPROVE,
    REOPEN,
    ApproveAction,
    ReopenAction,
} from './types';

export const submitForReview = () =>
    createAction<SubmitForReviewAction>(SUBMIT_FOR_REVIEW);

export const escalate = () => createAction<EscalateAction>(ESCALATE);

export const approve = () => createAction<ApproveAction>(APPROVE);

export const reopen = () => createAction<ReopenAction>(REOPEN);
