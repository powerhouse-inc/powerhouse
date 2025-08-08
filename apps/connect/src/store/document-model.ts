import {
    type VetraDocumentModelModule,
    type VetraPackage,
    COMMON_PACKAGE_ID,
} from '@powerhousedao/state';
import {
    documentModelDocumentModelModule,
    type DocumentModelLib,
    type DocumentModelModule,
    type PHDocument,
} from 'document-model';
// Dynamic imports for vetra to avoid build issues when vetra is not available
let VetraPackageDocumentModel: any;
let DocumentEditorDocumentModel: any;
import { atom, useAtomValue } from 'jotai';
import { unwrap } from 'jotai/utils';
import { externalPackagesAtom } from './external-packages.js';

// Base document models - vetra modules will be loaded dynamically if available
const staticBaseDocumentModels = [
    driveDocumentModelModule,
    documentModelDocumentModelModule,
] as DocumentModelModule[];

export const baseDocumentModels = staticBaseDocumentModels;

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

    // Try to load vetra document models dynamically
    const vetraDocumentModels: DocumentModelModule[] = [];
    try {
        const vetraPath = '@powerhousedao/vetra/document-models';
        const vetraModules = (await import(vetraPath)) as {
            VetraPackage: DocumentModelModule;
            DocumentEditor: DocumentModelModule;
        };
        vetraDocumentModels.push(
            vetraModules.VetraPackage,
            vetraModules.DocumentEditor,
        );
    } catch (error) {
        console.warn('Vetra document models not available:', error);
    }

    const result = getUniqueDocumentModels(
        ...baseDocumentModels,
        ...vetraDocumentModels,
        ...externalDocumentModels,
    );
    return result;
});
documentModelsAtom.debugLabel = 'documentModelsAtomInConnect';

// blocks rendering until document models are loaded.
export const useDocumentModels = () => useAtomValue(documentModelsAtom);

const unwrappedDocumentModelsAtom = unwrap(documentModelsAtom);
unwrappedDocumentModelsAtom.debugLabel = 'unwrappedDocumentModelsAtomInConnect';

// will return undefined until document models are initialized. Does not block rendering.
export const useUnwrappedDocumentModelModules = () =>
    useAtomValue(unwrappedDocumentModelsAtom);

function getDocumentModelModule<TDocument extends PHDocument>(
    documentType: string | undefined,
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
    loadDocumentModelEditor,
    loadGenericDriveExplorerEditorModule,
} from './editor';

async function loadDocumentModelDocumentModelModule(): Promise<VetraDocumentModelModule> {
    const { documentModelDocumentModelModule } = await import('document-model');
    const documentModel = documentModelDocumentModelModule.documentModel;
    const name = documentModel.name;
    const documentType = documentModel.id;
    const unsafeIdFromDocumentType = documentType;
    const extension = documentModel.extension;
    const specifications = documentModel.specifications;
    const reducer = documentModelDocumentModelModule.reducer;
    const actions = documentModelDocumentModelModule.actions;
    const utils = documentModelDocumentModelModule.utils;
    const vetraDocumentModelModule: VetraDocumentModelModule = {
        id: unsafeIdFromDocumentType,
        name,
        documentType,
        extension,
        specifications,
        reducer,
        actions,
        utils,
        documentModel,
    };
    return vetraDocumentModelModule;
}

async function loadDriveDocumentModelModule(): Promise<VetraDocumentModelModule> {
    const { driveDocumentModelModule } = await import('document-drive');
    const documentModel = driveDocumentModelModule.documentModel;
    const name = documentModel.name;
    const documentType = documentModel.id;
    const unsafeIdFromDocumentType = documentType;
    const extension = documentModel.extension;
    const specifications = documentModel.specifications;
    const reducer = driveDocumentModelModule.reducer;
    const actions = driveDocumentModelModule.actions;
    const utils = driveDocumentModelModule.utils;
    const vetraDocumentModelModule: VetraDocumentModelModule = {
        id: unsafeIdFromDocumentType,
        name,
        documentType,
        extension,
        specifications,
        reducer,
        actions,
        utils,
        documentModel,
    };
    return vetraDocumentModelModule;
}

export async function loadCommonPackage(): Promise<VetraPackage> {
    const documentModelDocumentModelModule =
        await loadDocumentModelDocumentModelModule();
    const driveDocumentModelModule = await loadDriveDocumentModelModule();
    const documentModelEditorModule = await loadDocumentModelEditor();
    const genericDriveExplorerEditorModule =
        await loadGenericDriveExplorerEditorModule();
    const vetraPackage: VetraPackage = {
        id: COMMON_PACKAGE_ID,
        name: 'Common',
        description: 'Common',
        category: 'Common',
        author: {
            name: 'Powerhouse',
            website: 'https://powerhousedao.com',
        },
        modules: {
            documentModelModules: [
                documentModelDocumentModelModule,
                driveDocumentModelModule,
            ],
            editorModules: [
                documentModelEditorModule,
                genericDriveExplorerEditorModule,
            ],
        },
    };
    return vetraPackage;
}
