import { BaseDocument } from '../../../document';
import { BudgetStatementAction, State } from '../../custom';
import {
    approve,
    escalate,
    reopenToDraft,
    reopenToReview,
    submitForReview,
} from './creators';

export default class StatusObject extends BaseDocument<
    State,
    BudgetStatementAction
> {
    /**
     * Submits the budget statement for review.
     *
     * @group Status
     */
    public submitForReview() {
        return this.dispatch(submitForReview());
    }

    /**
     * Escalates the budget statement.
     *
     * @group Status
     */
    public escalate() {
        return this.dispatch(escalate());
    }

    /**
     * Approves the budget statement.
     *
     * @group Status
     */
    public approve() {
        return this.dispatch(approve());
    }

    /**
     * Reopens the budget statement to draft status.
     * @returns A promise that resolves when the action is complete.
     *
     * @group Status
     */
    public reopenToDraft() {
        return this.dispatch(reopenToDraft());
    }

    /**
     * Reopens the budget statement to review status.
     * @returns A promise that resolves when the action is complete.
     *
     * @group Status
     */
    public reopenToReview() {
        return this.dispatch(reopenToReview());
    }

    /**
     * Gets the current status of the budget statement.
     * @returns The status of the budget statement.
     *
     * @group Status
     */
    get status() {
        return this.state.data.status;
    }
}
