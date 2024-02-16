import { ExtendedEditor } from '../types';
import Editor from './editor';
import {
    BudgetStatementAction,
    BudgetStatementLocalState,
    BudgetStatementState,
} from '../../document-models/budget-statement';

export const module: ExtendedEditor<
    BudgetStatementState,
    BudgetStatementAction,
    BudgetStatementLocalState
> = {
    Component: Editor,
    documentTypes: ['powerhouse/budget-statement'],
    config: {
        id: 'budget-statement-editor',
        disableExternalControls: false,
    },
};

export default module;
