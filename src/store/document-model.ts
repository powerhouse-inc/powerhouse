import * as DocumentModels from 'document-model-libs/document-models';
import { Action, DocumentModel } from 'document-model/document';
import { module as DocumentModelLib } from 'document-model/document-model';
import { atom, useAtomValue } from 'jotai';
import { useFeatureFlag } from 'src/hooks/useFeatureFlags';

export const documentModels = [
    DocumentModelLib,
    ...Object.values(DocumentModels),
] as DocumentModel[];

export const documentModelsAtom = atom(documentModels);

export const useDocumentModels = () => useAtomValue(documentModelsAtom);

function getDocumentModel<S = unknown, A extends Action = Action>(
    documentType: string,
    documentModels: DocumentModel[],
) {
    return documentModels.find(d => d.documentModel.id === documentType) as
        | DocumentModel<S, A>
        | undefined;
}

export function useDocumentModel<S = unknown, A extends Action = Action>(
    documentType: string,
) {
    const documentModels = useDocumentModels();
    return getDocumentModel<S, A>(documentType, documentModels);
}

export const useGetDocumentModel = () => {
    const documentModels = useDocumentModels();
    return (documentType: string) =>
        getDocumentModel(documentType, documentModels);
};

/**
 * Returns an array of filtered document models based on the enabled and disabled editors (feature flag).
 * If enabledEditors is set to '*', returns all document models.
 * If disabledEditors is set to '*', returns an empty array.
 * If disabledEditors is an array, filters out document models whose IDs are included in the disabledEditors array.
 * If enabledEditors is an array, filters document models whose IDs are included in the enabledEditors array.
 * @returns {Array<DocumentModel>} The filtered document models.
 */
export const useFilteredDocumentModels = () => {
    const documentModels = useDocumentModels();
    const { config } = useFeatureFlag();
    const { enabledEditors, disabledEditors } = config.editors;

    if (enabledEditors === '*') {
        return documentModels;
    }

    if (disabledEditors === '*') {
        return [];
    }

    if (disabledEditors) {
        return documentModels.filter(
            d => !disabledEditors.includes(d.documentModel.id),
        );
    }

    if (enabledEditors) {
        return documentModels.filter(d =>
            enabledEditors.includes(d.documentModel.id),
        );
    }

    return documentModels;
};
