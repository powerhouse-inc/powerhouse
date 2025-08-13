import {
    DEFAULT_DRIVE_EDITOR_ID,
    type VetraEditorModule,
} from '@powerhousedao/state';

export async function loadGenericDriveExplorerEditorModule(): Promise<VetraEditorModule> {
    const { GenericDriveExplorer: genericDriveExplorerEditorModule } =
        await import(
            '@powerhousedao/common/editors/generic-drive-explorer/index'
        );
    const name = 'Generic Drive Explorer';
    const documentTypes = genericDriveExplorerEditorModule.documentTypes;
    const Component = genericDriveExplorerEditorModule.Component;
    const config = genericDriveExplorerEditorModule.config;
    const vetraEditorModule: VetraEditorModule = {
        id: DEFAULT_DRIVE_EDITOR_ID,
        name,
        documentTypes,
        Component,
        config,
    };
    return vetraEditorModule;
}

export async function loadDocumentModelEditor(): Promise<VetraEditorModule> {
    const { documentModelEditorModule } = await import(
        '@powerhousedao/builder-tools/document-model-editor'
    );
    const config = documentModelEditorModule.config;
    const unsafeIdFromConfig = config.id;
    const name = 'Document Model Editor';
    const documentTypes = documentModelEditorModule.documentTypes;
    const Component = documentModelEditorModule.Component;
    const vetraEditorModule: VetraEditorModule = {
        id: unsafeIdFromConfig,
        name,
        documentTypes,
        Component,
        config,
    };
    return vetraEditorModule;
}
