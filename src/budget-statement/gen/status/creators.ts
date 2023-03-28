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
 * @category Actions
 */
export const submitForReview = () =>
    createAction<SubmitForReviewAction>(SUBMIT_FOR_REVIEW);

/**
 * Escalates the budget statement if there is any issue.
 *
 * @category Actions
 */
export const escalate = () => createAction<EscalateAction>(ESCALATE);

/**
 * Approves the budget statement.
 *
 * @category Actions
 */
export const approve = () => createAction<ApproveAction>(APPROVE);

/**
 * Reopens the budget statement to draft state.
 *
 * @category Actions
 */
export const reopenToDraft = () =>
    createAction<ReopenToDraftAction>(REOPEN_TO_DRAFT);

/**
 * Reopens the budget statement to review state.
 *
 * @category Actions
 */
export const reopenToReview = () =>
    createAction<ReopenToReviewAction>(REOPEN_TO_REVIEW);
