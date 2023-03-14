import { Action } from '../../../document';
import { BudgetStatement } from '../../custom';

export const INIT = 'INIT';

export interface InitAction extends Action {
    type: typeof INIT;
    input: Partial<
        Omit<BudgetStatement, 'data'> & {
            data: Partial<BudgetStatement['data']>;
        }
    >;
}

export type BudgetStatementInitAction = InitAction;
