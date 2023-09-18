import {
    BudgetStatementAction,
    BudgetStatementState,
} from '../../document-models/budget-statement';
import { EditorModule } from '../common';
import Editor from './editor';

const Module: EditorModule<BudgetStatementState, BudgetStatementAction> = {
    Component: Editor,
    documentTypes: ['powerhouse/budget-statement'],
};

export default Module;
