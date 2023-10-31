import * as Lib from 'document-model-libs';
import { Action, DocumentModel, Editor } from 'document-model/document';
import { module as DocumentModelLib } from 'document-model/document-model';
import { editors as DspotEditors } from 'dspot-document-model-libs';
import { atom, useAtomValue } from 'jotai';

const documentModels = [
    DocumentModelLib,
    ...Lib.documentModels,
] as DocumentModel[];
const editors = [...Lib.editors, ...DspotEditors] as Editor[];

export const documentModelsAtom = atom(documentModels);
export const editorsAtom = atom(editors);

export const useDocumentModels = () => useAtomValue(documentModelsAtom);
export const useEditors = () => useAtomValue(editorsAtom);

const getDocumentModel = (
    documentType: string,
    documentModels: DocumentModel[]
) => documentModels.find(d => d.documentModel.id === documentType);

const getEditor = (documentType: string, editors: Editor[]) =>
    editors.find(e => e.documentTypes.includes(documentType)) ||
    editors.find(e => e.documentTypes.includes('*'));

export const useDocumentModel = (documentType: string) => {
    const documentModels = useDocumentModels();
    return getDocumentModel(documentType, documentModels);
};

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
