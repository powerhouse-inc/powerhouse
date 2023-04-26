import { BaseDocument } from '../../../document';
import {
    BudgetStatementAction,
    BudgetStatementDocument,
    State,
} from '../../custom';
import { init } from './creators';

export default class InitObject extends BaseDocument<
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
            Omit<BudgetStatementDocument, 'data'> & {
                data: Partial<BudgetStatementDocument['data']>;
            }
        >
    ) {
        return this.dispatch(init(budgetStatement));
    }
}
