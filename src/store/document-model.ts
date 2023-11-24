import * as DocumentModels from 'document-model-libs/document-models';
import { Action, DocumentModel } from 'document-model/document';
import { module as DocumentModelLib } from 'document-model/document-model';
import { atom, useAtomValue } from 'jotai';

export const documentModels = [
    DocumentModelLib,
    ...Object.values(DocumentModels),
] as DocumentModel[];

export const documentModelsAtom = atom(documentModels);

export const useDocumentModels = () => useAtomValue(documentModelsAtom);

function getDocumentModel<S = unknown, A extends Action = Action>(
    documentType: string,
    documentModels: DocumentModel[]
) {
    return documentModels.find(d => d.documentModel.id === documentType) as
        | DocumentModel<S, A>
        | undefined;
}

export function useDocumentModel<S = unknown, A extends Action = Action>(
    documentType: string
) {
    const documentModels = useDocumentModels();
    return getDocumentModel<S, A>(documentType, documentModels);
}

export const useGetDocumentModel = () => {
    const documentModels = useDocumentModels();
    return (documentType: string) =>
        getDocumentModel(documentType, documentModels);
};
