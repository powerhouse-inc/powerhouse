import { driveDocumentModelModule } from 'document-drive';
import {
    documentModelDocumentModelModule,
    DocumentModelModule,
} from 'document-model';
import { atom, useAtomValue } from 'jotai';
import { observe } from 'jotai-effect';
import { atomWithLazy, unwrap } from 'jotai/utils';
import { useFeatureFlag } from 'src/hooks/useFeatureFlags';
import { DocumentModelsModule } from 'src/utils/types';
import { atomStore } from '.';
import { externalPackagesAtom } from './external-packages';

export const LOCAL_DOCUMENT_MODELS = import.meta.env.LOCAL_DOCUMENT_MODELS;

export const baseDocumentModels = [
    driveDocumentModelModule,
    documentModelDocumentModelModule,
] as DocumentModelModule<any, any>[];

// removes document models with the same id, keeping the one that appears later
function getUniqueDocumentModels(
    ...documentModels: DocumentModelModule<any, any>[]
): DocumentModelModule<any, any>[] {
    const uniqueModels = new Map<string, DocumentModelModule<any, any>>();

    for (const model of documentModels) {
        uniqueModels.set(model.documentType, model);
    }

    return Array.from(uniqueModels.values());
}

function getDocumentModelsFromModules(modules: DocumentModelsModule[]) {
    return modules
        .map(module => module.documentModels)
        .reduce((acc, val) => acc.concat(val), []);
}

async function loadDynamicModels() {
    if (!LOCAL_DOCUMENT_MODELS) {
        return [];
    }
    try {
        const localModules = (await import(
            'LOCAL_DOCUMENT_MODELS'
        )) as unknown as Record<string, DocumentModelModule<any, any>>;
        console.log('Loaded local document models:', localModules);
        return Object.values(localModules);
    } catch (e) {
        console.error('Error loading local document models', e);
        return [];
    }
}

const dynamicDocumentModelsAtom = atomWithLazy(loadDynamicModels);

export const documentModelsAtom = atom(async get => {
    const dynamicDocumentModels = await get(dynamicDocumentModelsAtom);
    const externalModules = (await get(
        externalPackagesAtom,
    )) as DocumentModelsModule[];
    const externalDocumentModels =
        getDocumentModelsFromModules(externalModules);

    const result = getUniqueDocumentModels(
        ...baseDocumentModels,
        ...externalDocumentModels,
        ...dynamicDocumentModels,
    );
    return result;
});

// blocks rendering until document models are loaded.
export const useDocumentModels = () => useAtomValue(documentModelsAtom);

const unrappedDocumentModelsAtom = unwrap(documentModelsAtom);

// will return undefined until document models are initialized. Does not block rendering.
export const useUnwrappedDocumentModels = () =>
    useAtomValue(unrappedDocumentModelsAtom);

export const subscribeDocumentModels = function (
    listener: (documentModels: DocumentModelModule<any, any>[]) => void,
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

function getDocumentModel<TGlobalState, TLocalState>(
    documentType: string,
    documentModels:
        | DocumentModelModule<TGlobalState, TLocalState>[]
        | undefined,
) {
    return documentModels?.find(d => d.documentModelName === documentType);
}

export function useDocumentModel<TGlobalState, TLocalState>(
    documentType: string,
) {
    const documentModels = useUnwrappedDocumentModels();
    return getDocumentModel<TGlobalState, TLocalState>(
        documentType,
        documentModels,
    );
}

export const useGetDocumentModel = <TGlobalState, TLocalState>() => {
    const documentModels = useUnwrappedDocumentModels();
    return (documentType: string) =>
        getDocumentModel<TGlobalState, TLocalState>(
            documentType,
            documentModels,
        );
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
    const documentModels = useUnwrappedDocumentModels();
    const { config } = useFeatureFlag();
    const { enabledEditors, disabledEditors } = config.editors;

    if (!documentModels) {
        return undefined;
    }

    const filteredDocumentModels = documentModels.filter(
        model => model.documentModelName !== 'powerhouse/document-drive',
    );

    if (enabledEditors === '*') {
        return documentModels;
    }

    if (disabledEditors === '*') {
        return [];
    }

    if (disabledEditors) {
        return filteredDocumentModels.filter(
            d => !disabledEditors.includes(d.documentModelName),
        );
    }

    if (enabledEditors) {
        return filteredDocumentModels.filter(d =>
            enabledEditors.includes(d.documentModelName),
        );
    }

    return filteredDocumentModels;
};
