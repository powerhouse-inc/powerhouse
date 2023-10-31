import type { Document, DocumentModel } from 'document-model/document';

export async function saveFile(
    document: Document,
    getDocumentModel: (documentType: string) => DocumentModel | undefined
) {
    const documentModel = getDocumentModel(document.documentType);
    if (!documentModel) {
        throw new Error(
            `Document model not supported: ${document.documentType}`
        );
    }

    const extension = documentModel?.utils.fileExtension;
    const fileHandle = await window.showSaveFilePicker({
        suggestedName: `${document.name || 'Untitled'}.${
            extension ? `${extension}.` : ''
        }zip`,
    });

    await documentModel.utils.saveToFileHandle(document, fileHandle);
    const path = (await fileHandle.getFile()).path;
    if (typeof window !== undefined) {
        window.electronAPI?.fileSaved(document, path);
    }
    return path;
}

export async function loadFile(
    path: string | File,
    getDocumentModel: (documentType: string) => DocumentModel | undefined
) {
    const Document = await import('document-model/document');
    const baseDocument = await Document.utils.loadFromInput(
        path,
        (state: Document) => state
    );
    const documentModel = getDocumentModel(baseDocument.documentType);
    if (!documentModel) {
        throw new Error(
            `Document "${baseDocument.documentType}" is not supported`
        );
    }
    return documentModel.utils.loadFromInput(path);
}
