import { useFeatureFlag } from '#hooks';
import { atomStore } from '@powerhousedao/common';
import { driveDocumentModelModule } from 'document-drive';
import {
    documentModelDocumentModelModule,
    type DocumentModelLib,
    type DocumentModelModule,
    type PHDocument,
} from 'document-model';
import { atom, useAtomValue } from 'jotai';
import { observe } from 'jotai-effect';
import { unwrap } from 'jotai/utils';
import { externalPackagesAtom } from './external-packages.js';

export const baseDocumentModels = [
    driveDocumentModelModule,
    documentModelDocumentModelModule,
] as DocumentModelModule[];

// removes document models with the same id, keeping the one that appears later
function getUniqueDocumentModels(
    ...documentModels: DocumentModelModule[]
): DocumentModelModule[] {
    const uniqueModels = new Map<string, DocumentModelModule>();

    for (const model of documentModels) {
        uniqueModels.set(model.documentModel.id, model);
    }

    return Array.from(uniqueModels.values());
}

function getDocumentModelsFromModules(modules: DocumentModelLib[]) {
    return modules
        .map(module => module.documentModels)
        .reduce((acc, val) => acc.concat(val), []);
}

export const documentModelsAtom = atom(async get => {
    const externalModules = (await get(
        externalPackagesAtom,
    )) as DocumentModelLib[];
    const externalDocumentModels =
        getDocumentModelsFromModules(externalModules);

    const result = getUniqueDocumentModels(
        ...baseDocumentModels,
        ...externalDocumentModels,
    );
    return result;
});

// blocks rendering until document models are loaded.
export const useDocumentModels = () => useAtomValue(documentModelsAtom);

const unrappedDocumentModelsAtom = unwrap(documentModelsAtom);

// will return undefined until document models are initialized. Does not block rendering.
export const useUnwrappedDocumentModelModules = () =>
    useAtomValue(unrappedDocumentModelsAtom);

export const subscribeDocumentModels = function (
    listener: (documentModels: DocumentModelModule[]) => void,
) {
    // activate the effect on the default store
    const unobserve = observe(get => {
        const documentModels = get(documentModelsAtom);
        documentModels.then(listener).catch(e => {
            throw e;
        });
    }, atomStore);

    // Clean up the effect
    return () => unobserve();
};

function getDocumentModelModule<TDocument extends PHDocument>(
    documentType: string,
    documentModels: DocumentModelModule[] | undefined,
) {
    return documentModels?.find(d => d.documentModel.id === documentType) as
        | DocumentModelModule<TDocument>
        | undefined;
}

export function useDocumentModelModule<TDocument extends PHDocument>(
    documentType: string,
) {
    const documentModelModules = useUnwrappedDocumentModelModules();
    return getDocumentModelModule<TDocument>(
        documentType,
        documentModelModules,
    );
}

export const useGetDocumentModelModule = <TDocument extends PHDocument>() => {
    const documentModelModules = useUnwrappedDocumentModelModules();
    return (documentType: string) =>
        getDocumentModelModule<TDocument>(documentType, documentModelModules);
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
    const documentModels = useUnwrappedDocumentModelModules();
    const { config } = useFeatureFlag();
    const { enabledEditors, disabledEditors } = config.editors;

    if (!documentModels) {
        return undefined;
    }

    const filteredDocumentModels = documentModels.filter(
        model => model.documentModel.id !== 'powerhouse/document-drive',
    );

    if (enabledEditors === '*') {
        return documentModels;
    }

    if (disabledEditors === '*') {
        return [];
    }

    if (disabledEditors) {
        return filteredDocumentModels.filter(
            d => !disabledEditors.includes(d.documentModel.id),
        );
    }

    if (enabledEditors) {
        return filteredDocumentModels.filter(d =>
            enabledEditors.includes(d.documentModel.id),
        );
    }

    return filteredDocumentModels;
};
