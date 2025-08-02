import {
    DEFAULT_DRIVE_EDITOR_ID,
    type VetraEditorModule,
} from '@powerhousedao/state';

export async function loadGenericDriveExplorerEditorModule(): Promise<VetraEditorModule> {
    const genericDriveExplorerEditorModule = await import(
        '@powerhousedao/common/editors/generic-drive-explorer/index'
    );
    const vetraEditorModule: VetraEditorModule = {
        id: DEFAULT_DRIVE_EDITOR_ID,
        name: 'Generic Drive Explorer',
        documentTypes: ['powerhouse/document-drive'],
        Component:
            genericDriveExplorerEditorModule.GenericDriveExplorer.Component,
        config: genericDriveExplorerEditorModule.GenericDriveExplorer.config,
    };
    return vetraEditorModule;
}

export async function loadDocumentModelEditor(): Promise<VetraEditorModule> {
    const documentModelEditorModule = await import(
        '@powerhousedao/builder-tools/document-model-editor'
    );
    await import('@powerhousedao/builder-tools/style.css');
    const vetraEditorModule: VetraEditorModule = {
        id: documentModelEditorModule.documentModelEditorModule.config.id,
        name: 'Document Model Editor',
        documentTypes: ['powerhouse/document-model'],
        Component:
            documentModelEditorModule.documentModelEditorModule.Component,
        config: documentModelEditorModule.documentModelEditorModule.config,
    };
    return vetraEditorModule;
}
