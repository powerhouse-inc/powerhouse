/**
* This is a scaffold file meant for customization.
* Delete the file and run the code generator again to have it reset
*/

import { actions as BaseActions, DocumentModel } from 'document-model/document';
import { actions as BudgetStatementActions, BudgetStatement } from './gen';
import { reducer } from './gen/reducer';
import { documentModel } from './gen/document-model';
import genUtils from './gen/utils';
import * as customUtils from './src/utils';
import { BudgetStatementState, BudgetStatementAction } from './gen/types';

const Document = BudgetStatement;
const utils = { ...genUtils, ...customUtils };
const actions = { ...BaseActions, ...BudgetStatementActions };

export const module: DocumentModel<
    BudgetStatementState,
    BudgetStatementAction,
    BudgetStatement
> = {
    Document,
    reducer,
    actions,
    utils,
    documentModel
};

export {
    BudgetStatement,
    Document,
    reducer,
    actions,
    utils,
    documentModel
}

export * from './gen/types';
export * from './src/utils';