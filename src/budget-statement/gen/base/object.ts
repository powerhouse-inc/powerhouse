import { BaseDocument } from '../../../document';
import {
    BudgetStatementAction,
    FtesInput,
    OwnerInput,
    State,
} from '../../custom';
import { setFtes, setMonth, setOwner, setQuoteCurrency } from './creators';

export default class BaseObject extends BaseDocument<
    State,
    BudgetStatementAction
> {
    /**
     * Gets the month of the budget statement.
     * @category Budget Statement
     */
    get month() {
        return this.state.month;
    }

    /**
     * Gets the owner of the budget statement.
     * @category Budget Statement
     */
    get owner() {
        return this.state.owner;
    }

    /**
     * Gets the quote currency of the budget statement.
     * @category Budget Statement
     */
    get quoteCurrency() {
        return this.state.quoteCurrency;
    }

    get ftes() {
        return this.state.ftes;
    }

    public setOwner(owner: OwnerInput) {
        return this.dispatch(setOwner(owner));
    }

    public setMonth(month: string) {
        return this.dispatch(setMonth(month));
    }

    public setQuoteCurrency(currency: string) {
        return this.dispatch(setQuoteCurrency(currency));
    }

    public setFtes(ftes: FtesInput) {
        return this.dispatch(setFtes(ftes));
    }
}
