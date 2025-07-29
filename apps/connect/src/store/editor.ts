import { type PHPackage } from '@powerhousedao/state';

export async function loadBaseEditors() {
    const documentModelEditor = await import(
        '@powerhousedao/builder-tools/document-model-editor'
    );
    await import('@powerhousedao/builder-tools/style.css');
    const module = {
        id: 'document-model-editor-v2',
        ...documentModelEditor.documentModelEditorModule,
    };
    return [module];
}

export async function loadBaseDocumentModelEditor() {
    const documentModelEditor = await import(
        '@powerhousedao/builder-tools/document-model-editor'
    );
    await import('@powerhousedao/builder-tools/style.css');
    return {
        id: 'document-model-editor-v2',
        editors: [documentModelEditor.documentModelEditorModule],
    } as PHPackage;
}
