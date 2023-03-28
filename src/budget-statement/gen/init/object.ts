import { DocumentObject } from '../../../document';
import { BudgetStatement, BudgetStatementAction, State } from '../../custom';
import { init } from './creators';

export default class InitObject extends DocumentObject<
    State,
    BudgetStatementAction
> {
    /**
     * Initializes the state of the budget statement with the provided partial object.
     *
     * @param budgetStatement - A partial object of the budget statement to initialize.
     */
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
