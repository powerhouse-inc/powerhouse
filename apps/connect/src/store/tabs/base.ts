import {
    BudgetStatementDocument,
    ExtendedBudgetStatementState,
    utils,
} from '@acaldas/document-model-libs/browser/budget-statement';
import {
    ExtendedScopeFrameworkState,
    createEmptyExtendedScopeFrameworkState,
} from '@acaldas/document-model-libs/browser/scope-framework';
import {
    Action,
    BaseAction,
    Document,
} from '@acaldas/document-model-libs/document';
import { EditorComponent } from 'src/components/editors';
import BudgetStatementEditor from 'src/components/editors/budget-statement';
import ScopeFrameworkEditor from 'src/components/editors/scope-framework';
import tabNew from 'src/components/tabs/tab-new';

export type TabType =
    | 'new'
    | 'powerhouse/document-model'
    | 'powerhouse/budget-statement'
    | 'makerdao/scope-framework';

export interface ITab {
    type: TabType;
    id: string;
    name: string;
    content: EditorComponent;
    document?: Document;
}

export type Tab = ITab;

export const Tab = {
    serialize(tab: ITab) {
        const { type, id, name, document } = tab;
        return JSON.stringify({ type, id, name, document });
    },
    fromString(value: string): ITab {
        const object = JSON.parse(value);
        const type = object.type as TabType;
        switch (object.type) {
            case 'new':
                return createTab(object.id);
            case 'powerhouse/budget-statement':
                return createTab(
                    object.id,
                    object.name,
                    object.budgetStatement
                );
            case 'makerdao/scope-framework':
                return createScopeFrameworkTab(
                    object.scopeFramework,
                    object.id
                );
            case 'powerhouse/document-model':
                return createTab(object.id, object.name);
            default:
                throw new Error(`Tab type ${type} was not handled`);
        }
    },
    fromDocument<T extends Document>(document: T, id?: string): ITab {
        switch (document.documentType) {
            case 'powerhouse/budget-statement':
                return createBudgetStatementTab(
                    document as BudgetStatementDocument,
                    id
                );
            case 'makerdao/scope-framework':
                return createScopeFrameworkTab(
                    document as ExtendedScopeFrameworkState,
                    id
                );
            case 'powerhouse/document-model':
                return createTab(
                    'powerhouse/document-model',
                    id,
                    document.name
                );
            default:
                throw new Error(
                    `Document with type ${document.documentType} was not handled`
                );
        }
    },
};

export function createTab<T = unknown, A extends Action = Action>(
    type: TabType,
    id?: string,
    name?: string,
    document?: Document,
    content?: EditorComponent<T, A>
): ITab {
    return {
        type: type,
        id: id ?? window.crypto.randomUUID(),
        name: name ?? 'New tab',
        content: (content as unknown as EditorComponent) ?? tabNew,
        document,
    };
}

export function createDocumentTab<T = unknown, A extends Action = Action>(
    document: Document<T, A | BaseAction>,
    content?: EditorComponent<T, A>,
    id?: string,
    name?: string
) {
    return createTab(
        document.documentType as TabType,
        id,
        name ?? document.name,
        document,
        content
    );
}

export function createScopeFrameworkTab(
    document?: ExtendedScopeFrameworkState,
    id?: string
) {
    const scope = document ?? createEmptyExtendedScopeFrameworkState();
    return createDocumentTab(scope, ScopeFrameworkEditor, id, 'New scope');
}

export function createBudgetStatementTab(
    document?: ExtendedBudgetStatementState,
    id?: string
) {
    const scope = document ?? utils.createBudgetStatement();
    return createDocumentTab(scope, BudgetStatementEditor, id, 'New budget');
}
