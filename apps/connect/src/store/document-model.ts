import { ExtendedEditor } from 'document-model-libs';
import * as DocumentModels from 'document-model-libs/document-models';
import { Action, DocumentModel } from 'document-model/document';
import { module as DocumentModelLib } from 'document-model/document-model';
import { atom, useAtomValue } from 'jotai';
import { unwrap } from 'jotai/utils';
import { useFeatureFlag } from 'src/hooks/useFeatureFlags';
import { atomStore } from '.';

export const LOCAL_DOCUMENT_MODELS = import.meta.env.LOCAL_DOCUMENT_MODELS;
const LOAD_EXTERNAL_PROJECTS = import.meta.env.LOAD_EXTERNAL_PROJECTS;

export type ExternalProjectModule = {
    documentModels?: DocumentModel[];
    editors?: ExtendedEditor[];
};

export async function loadPackages(): Promise<ExternalProjectModule[]> {
    if (!LOAD_EXTERNAL_PROJECTS || LOAD_EXTERNAL_PROJECTS !== 'true') {
        return [];
    }

    try {
        const module = (await import('EXTERNAL_PROJECTS')) as unknown as {
            default: ExternalProjectModule[];
        };

        return module.default;
    } catch (e) {
        console.error('Error loading external projects', e);
        return [];
    }
}

function getDocumentModelsFromModules(modules: ExternalProjectModule[]) {
    return modules
        .filter(module => !!module.documentModels)
        .map(
            module =>
                (module as Required<ExternalProjectModule>).documentModels,
        )
        .reduce((acc, val) => acc.concat(val), []);
}

async function loadDynamicModels() {
    if (!LOCAL_DOCUMENT_MODELS) {
        return [];
    }
    try {
        const localModules = (await import(
            'LOCAL_DOCUMENT_MODELS'
        )) as unknown as Record<string, DocumentModel>;
        console.log('Loaded local document models:', localModules);
        return Object.values(localModules);
    } catch (e) {
        console.error('Error loading local document models', e);
        return [];
    }
}

export const baseDocumentModelsMap: Record<string, DocumentModel> = {
    DocumentModel: DocumentModelLib as DocumentModel,
    ...(DocumentModels as Record<string, DocumentModel>),
};

export const baseDocumentModels = Object.values(baseDocumentModelsMap);

const dynamicDocumentModels = loadDynamicModels();

export const packagesDocumentModels = loadPackages();

const dynamicDocumentModelsAtom = atom<Promise<DocumentModel[]>>(
    dynamicDocumentModels,
);

const packagesDocumentModelsAtom = atom<Promise<ExternalProjectModule[]>>(
    packagesDocumentModels,
);

export const documentModelsAtom = atom(async get => {
    const dynamicDocumentModels = await get(dynamicDocumentModelsAtom);
    const pkgDocumentModels = await get(packagesDocumentModelsAtom);

    const newDocumentModelIds = dynamicDocumentModels.map(
        dm => dm.documentModel.id,
    );
    return [
        ...baseDocumentModels.filter(
            dm => !newDocumentModelIds.includes(dm.documentModel.id),
        ),
        ...dynamicDocumentModels,
        ...getDocumentModelsFromModules(pkgDocumentModels),
    ];
});

// blocks rendering until document models are loaded.
export const useDocumentModels = () => useAtomValue(documentModelsAtom);

const unrappedDocumentModelsAtom = unwrap(documentModelsAtom);
// will return undefined until document models are initialized. Does not block rendering.
export const useUnwrappedDocumentModels = () =>
    useAtomValue(unrappedDocumentModelsAtom);

export const useDocumentModelsAsync = () => dynamicDocumentModels;

export const subscribeDocumentModels = function (
    listener: (documentModels: DocumentModel[]) => void,
) {
    return atomStore.sub(documentModelsAtom, () => {
        atomStore
            .get(documentModelsAtom)
            .then(listener)
            .catch(e => {
                throw e;
            });
    });
};

function getDocumentModel<S = unknown, A extends Action = Action>(
    documentType: string,
    documentModels: DocumentModel[] | undefined,
) {
    return documentModels?.find(d => d.documentModel.id === documentType) as
        | DocumentModel<S, A>
        | undefined;
}

export function useDocumentModel<S = unknown, A extends Action = Action>(
    documentType: string,
) {
    const documentModels = useUnwrappedDocumentModels();
    return getDocumentModel<S, A>(documentType, documentModels);
}

export const useGetDocumentModel = () => {
    const documentModels = useUnwrappedDocumentModels();
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
    const documentModels = useUnwrappedDocumentModels();
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
