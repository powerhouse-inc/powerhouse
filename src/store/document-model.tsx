import * as Lib from 'document-model-libs';
import { Action, DocumentModel, Editor } from 'document-model/document';
import { module as DocumentModelLib } from 'document-model/document-model';
import { atom, useAtomValue } from 'jotai';

export const documentModels = [
    DocumentModelLib,
    ...Lib.documentModels,
] as DocumentModel[];
const editors = [...Lib.editors] as Editor[];

export const documentModelsAtom = atom(documentModels);
export const editorsAtom = atom(editors);

export const useDocumentModels = () => useAtomValue(documentModelsAtom);
export const useEditors = () => useAtomValue(editorsAtom);

function getDocumentModel<S = unknown, A extends Action = Action>(
    documentType: string,
    documentModels: DocumentModel[]
) {
    return documentModels.find(d => d.documentModel.id === documentType) as
        | DocumentModel<S, A>
        | undefined;
}

const getEditor = (documentType: string, editors: Editor[]) =>
    editors.find(e => e.documentTypes.includes(documentType)) ||
    editors.find(e => e.documentTypes.includes('*'));

export function useDocumentModel<S = unknown, A extends Action = Action>(
    documentType: string
) {
    const documentModels = useDocumentModels();
    return getDocumentModel<S, A>(documentType, documentModels);
}

export const useEditor = (documentType: string) => {
    const editors = useEditors();
    return getEditor(documentType, editors);
};

export const useGetDocumentModel = () => {
    const documentModels = useDocumentModels();
    return (documentType: string) =>
        getDocumentModel(documentType, documentModels);
};

export const useGetEditor = () => {
    const editors = useEditors();
    return (documentType: string) => getEditor(documentType, editors);
};
