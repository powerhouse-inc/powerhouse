import { Editor as EditorModule } from 'document-model/document';
import Editor from './editor';
import {
    BudgetStatementAction,
    BudgetStatementLocalState,
    BudgetStatementState,
} from '../../document-models/budget-statement';

export const module: EditorModule<
    BudgetStatementState,
    BudgetStatementAction,
    BudgetStatementLocalState
> = {
    Component: Editor,
    documentTypes: ['powerhouse/budget-statement'],
};

export default module;
