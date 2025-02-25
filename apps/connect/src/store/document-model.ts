import { useFeatureFlag } from '#hooks/useFeatureFlags/index';
import { driveDocumentModelModule } from 'document-drive';
import {
    documentModelDocumentModelModule,
    DocumentModelLib,
    DocumentModelModule,
} from 'document-model';
import { atom, useAtomValue } from 'jotai';
import { observe } from 'jotai-effect';
import { atomWithLazy, unwrap } from 'jotai/utils';
import { atomStore } from '.';
import { externalPackagesAtom } from './external-packages';

export const LOCAL_DOCUMENT_MODELS = import.meta.env.LOCAL_DOCUMENT_MODELS;

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
        uniqueModels.set(model.documentType, model);
    }

    return Array.from(uniqueModels.values());
}

function getDocumentModelsFromModules(modules: DocumentModelLib[]) {
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
        )) as unknown as Record<string, DocumentModelModule>;
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
    )) as DocumentModelLib[];
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

function getDocumentModelModule<TGlobalState, TLocalState>(
    documentType: string,
    documentModels:
        | DocumentModelModule<TGlobalState, TLocalState>[]
        | undefined,
) {
    return documentModels?.find(d => d.documentModelName === documentType);
}

export function useDocumentModelModule<TGlobalState, TLocalState>(
    documentType: string,
) {
    const documentModelModules = useUnwrappedDocumentModelModules();
    return getDocumentModelModule<TGlobalState, TLocalState>(
        documentType,
        documentModelModules as DocumentModelModule<
            TGlobalState,
            TLocalState
        >[],
    );
}

export const useGetDocumentModelModule = <TGlobalState, TLocalState>() => {
    const documentModelModules = useUnwrappedDocumentModelModules();
    return (documentType: string) =>
        getDocumentModelModule(
            documentType,
            documentModelModules as DocumentModelModule<
                TGlobalState,
                TLocalState
            >[],
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
    const documentModels = useUnwrappedDocumentModelModules();
    const { config } = useFeatureFlag();
    const { enabledEditors, disabledEditors } = config.editors;

    if (!documentModels) {
        return undefined;
    }

    const filteredDocumentModels = documentModels.filter(
        model => model.documentType !== 'powerhouse/document-drive',
    );

    if (enabledEditors === '*') {
        return documentModels;
    }

    if (disabledEditors === '*') {
        return [];
    }

    if (disabledEditors) {
        return filteredDocumentModels.filter(
            d => !disabledEditors.includes(d.documentType),
        );
    }

    if (enabledEditors) {
        return filteredDocumentModels.filter(d =>
            enabledEditors.includes(d.documentType),
        );
    }

    return filteredDocumentModels;
};
