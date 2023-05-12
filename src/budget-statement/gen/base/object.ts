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
