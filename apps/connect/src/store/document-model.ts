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
                documentModelDocumentModelModule
                    .documentModelDocumentModelModule.documentModel
                    .specifications,
        },
        reducer:
            documentModelDocumentModelModule.documentModelDocumentModelModule
                .reducer,
        actions:
            documentModelDocumentModelModule.documentModelDocumentModelModule
                .actions,
        utils: documentModelDocumentModelModule.documentModelDocumentModelModule
            .utils,
    };
    return vetraDocumentModelModule;
}

async function loadDriveDocumentModelModule(): Promise<VetraDocumentModelModule> {
    const driveDocumentModelModule = await import('document-drive');
    const vetraDocumentModelModule: VetraDocumentModelModule = {
        id: 'powerhouse/document-drive',
        name: 'Document Drive',
        documentModel:
            driveDocumentModelModule.driveDocumentModelModule.documentModel,
        reducer: driveDocumentModelModule.driveDocumentModelModule.reducer,
        actions: driveDocumentModelModule.driveDocumentModelModule.actions,
        utils: driveDocumentModelModule.driveDocumentModelModule.utils,
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
