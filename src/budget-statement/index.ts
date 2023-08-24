/**
 * This is a scaffold file meant for customization.
 * Delete the file and run the code generator again to have it reset
 */

import { actions as BaseActions, DocumentModel } from '../document';
import * as customUtils from './custom/utils';
import { actions as BudgetStatementActions, BudgetStatement } from './gen';
import { documentModel } from './gen/document-model';
import { reducer } from './gen/reducer';
import { BudgetStatementAction, BudgetStatementState } from './gen/types';
import genUtils from './gen/utils';

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
    documentModel,
};

export * from './custom/utils';
export * from './gen/types';
export { BudgetStatement, Document, reducer, actions, utils, documentModel };
