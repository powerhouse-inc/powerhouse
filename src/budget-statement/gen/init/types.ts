import { InitAction } from 'document-model-graphql/budget-statement';

export const INIT = 'INIT';

// export interface InitAction extends Action {
//     type: typeof INIT;
//     input: Partial<
//         Omit<BudgetStatementDocument, 'data'> & {
//             data: Partial<BudgetStatementDocument['data']>;
//         }
//     >;
// }

export { InitAction };

export type BudgetStatementInitAction = InitAction;
