import {
    type VetraDocumentModelModule,
    type VetraPackage,
} from '@powerhousedao/state';
import {
    loadDocumentModelEditor,
    loadGenericDriveExplorerEditorModule,
} from './editor';

async function loadDocumentModelDocumentModelModule(): Promise<VetraDocumentModelModule> {
    const documentModelDocumentModelModule = await import('document-model');
    const vetraDocumentModelModule: VetraDocumentModelModule = {
        id: 'powerhouse/document-model',
        name: 'Document Model',
        documentModel: {
            author: {
                name: 'Powerhouse',
                website: 'https://powerhousedao.com',
            },
            description: 'Document Model',
            extension: '.phdm',
            id: 'powerhouse/document-model',
            name: 'Document Model',
            specifications:
                documentModelDocumentModelModule.default
                    .documentModelDocumentModelModule.documentModel
                    .specifications,
        },
        reducer: documentModelDocumentModelModule.default.documentModelReducer,
        actions: documentModelDocumentModelModule.default.actions,
        utils: documentModelDocumentModelModule.default,
    };
    return vetraDocumentModelModule;
}

async function loadDriveDocumentModelModule(): Promise<VetraDocumentModelModule> {
    const driveDocumentModelModule = await import('document-drive');
    const vetraDocumentModelModule: VetraDocumentModelModule = {
        id: 'powerhouse/document-drive',
        name: 'Document Drive',
        documentModel:
            driveDocumentModelModule.default.driveDocumentModelModule
                .documentModel,
        reducer:
            driveDocumentModelModule.default.driveDocumentModelModule.reducer,
        actions:
            driveDocumentModelModule.default.driveDocumentModelModule.actions,
        utils: driveDocumentModelModule.default.driveDocumentModelModule.utils,
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
        id: 'powerhouse/common',
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
