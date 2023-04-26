import { createAction } from '../../../document/utils';
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

/**
 * Submits the budget statement for review.
 *
 * @group Status
 */
export const submitForReview = () =>
    createAction<SubmitForReviewAction>(SUBMIT_FOR_REVIEW);

/**
 * Escalates the budget statement if there is any issue.
 *
 * @group Status
 */
export const escalate = () => createAction<EscalateAction>(ESCALATE);

/**
 * Approves the budget statement.
 *
 * @group Status
 */
export const approve = () => createAction<ApproveAction>(APPROVE);

/**
 * Reopens the budget statement to draft state.
 *
 * @group Status
 */
export const reopenToDraft = () =>
    createAction<ReopenToDraftAction>(REOPEN_TO_DRAFT);

/**
 * Reopens the budget statement to review state.
 *
 * @group Status
 */
export const reopenToReview = () =>
    createAction<ReopenToReviewAction>(REOPEN_TO_REVIEW);
