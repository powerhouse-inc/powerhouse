import { DocumentObject } from '../../../document';
import { BudgetStatementAction, State } from '../../custom';
import {
    approve,
    escalate,
    reopenToDraft,
    reopenToReview,
    submitForReview,
} from './creators';

export default class StatusObject extends DocumentObject<
    State,
    BudgetStatementAction
> {
    public submitForReview() {
        return this.dispatch(submitForReview());
    }

    public escalate() {
        return this.dispatch(escalate());
    }

    public approve() {
        return this.dispatch(approve());
    }

    public reopenToDraft() {
        return this.dispatch(reopenToDraft());
    }

    public reopenToReview() {
        return this.dispatch(reopenToReview());
    }

    get status() {
        return this.state.data.status;
    }
}
