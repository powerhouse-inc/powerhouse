import {
    ExtendedScopeFrameworkState,
    createEmptyExtendedScopeFrameworkState,
} from '@acaldas/document-model-libs/browser/scope-framework';
import { Document } from '@acaldas/document-model-libs/document';
import { EditorComponent } from 'src/components/editors';
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
    fromString(value: string): Tab {
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
            case 'powerhouse/document-model':
                return createTab(object.id, object.name);
            case 'makerdao/scope-framework':
                return createScopeFrameworkTab(
                    object.scopeFramework,
                    object.id
                );
            default:
                throw new Error(`Tab type ${type} was not handled`);
        }
    },
    fromDocument<T extends Document>(document: T, id?: string) {
        switch (document.documentType) {
            case 'powerhouse/budget-statement':
                return createTab(
                    'powerhouse/budget-statement',
                    id,
                    document.name,
                    document
                );
            case 'powerhouse/document-model':
                return createTab(
                    'powerhouse/document-model',
                    id,
                    document.name
                );
            case 'makerdao/scope-framework':
                return createScopeFrameworkTab(
                    document as ExtendedScopeFrameworkState,
                    id
                );
            default:
                throw new Error(
                    `Document with type ${document.documentType} was not handled`
                );
        }
    },
};

export function createTab(
    type: TabType,
    id?: string,
    name?: string,
    document?: Document,
    content?: EditorComponent
): ITab {
    return {
        type: type,
        id: id ?? window.crypto.randomUUID(),
        name: name ?? 'New tab',
        content: content ?? tabNew,
        document,
    };
}

export function createDocumentTab(
    document: Document,
    content?: EditorComponent,
    id?: string
) {
    return createTab(
        document.documentType as TabType,
        id,
        document.name,
        document,
        content
    );
}

export function createScopeFrameworkTab(
    document?: ExtendedScopeFrameworkState,
    id?: string
) {
    const scope = document ?? createEmptyExtendedScopeFrameworkState();
    return createDocumentTab(scope, ScopeFrameworkEditor, id);
}
