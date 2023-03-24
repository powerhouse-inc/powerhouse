import { DocumentObject } from '../../../document';
import { BudgetStatement, BudgetStatementAction, State } from '../../custom';
import { init } from './creators';

export default class InitObject extends DocumentObject<
    State,
    BudgetStatementAction
> {
    public init(
        budgetStatement: Partial<
            Omit<BudgetStatement, 'data'> & {
                data: Partial<BudgetStatement['data']>;
            }
        >
    ) {
        return this.dispatch(init(budgetStatement));
    }
}
