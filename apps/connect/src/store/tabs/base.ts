import {
    Action,
    BaseAction,
    Document,
    DocumentModel,
    Editor,
} from 'document-model/document';
import { EditorComponent } from 'src/components/editors';

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
    async fromString(
        value: string,
        getDocumentModel: (documentType: string) => DocumentModel | undefined,
        getEditor: (documentType: string) => Editor | undefined
    ): Promise<ITab> {
        const object = JSON.parse(value);
        const type = object.type as TabType;
        if (type === 'new') {
            return createTab(object.id);
        }

        const documentModel = getDocumentModel(type);
        const editor = getEditor(type);
        if (!documentModel || !editor) {
            throw new Error(`Document not supported: ${type}`);
        }

        return createDocumentTab(
            documentModel,
            editor,
            object.document,
            object.id,
            object.name
        );
    },
    async fromDocument<T extends Document>(
        document: T,
        getDocumentModel: (documentType: string) => DocumentModel | undefined,
        getEditor: (documentType: string) => Editor | undefined,
        id?: string
    ): Promise<ITab> {
        const documentModel = getDocumentModel(document.documentType);
        const editor = getEditor(document.documentType);
        if (!documentModel || !editor) {
            throw new Error(`Document not supported: ${document.documentType}`);
        }

        return createDocumentTab(documentModel, editor, document, id);
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
    documentModel: DocumentModel<T, A>,
    editor: Editor<T, A>,
    document?: Document<T, A | BaseAction>,
    id?: string,
    name?: string
) {
    document = document ?? documentModel.utils.createDocument();
    return createTab(
        documentModel.documentModel.id as TabType,
        id,
        name ?? document.name,
        document
        // wrapEditor(documentModel, editor) TODO
    );
}

export async function preloadTabs() {
    // TODO
    // await Promise.all([
    //     import('document-model-libs/scope-framework'),
    //     import('src/components/editors/scope-framework'),
    //     import('document-model-libs/budget-statement'),
    //     import('src/components/editors/budget-statement'),
    // ]);
}
