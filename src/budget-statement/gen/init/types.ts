import { Action } from '../../../document';
import { BudgetStatementDocument } from '../../custom';

export const INIT = 'INIT';

export interface InitAction extends Action {
    type: typeof INIT;
    input: Partial<
        Omit<BudgetStatementDocument, 'data'> & {
            data: Partial<BudgetStatementDocument['data']>;
        }
    >;
}

export type BudgetStatementInitAction = InitAction;
