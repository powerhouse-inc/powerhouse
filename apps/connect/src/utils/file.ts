import type { Document, DocumentModel } from 'document-model/document';
import { utils } from 'document-model/document';

const downloadFile = async (document: Document) => {
    const zip = await utils.createZip(document);
    zip.generateAsync({ type: 'blob' })
        .then(blob => {
            const link = window.document.createElement('a');
            link.style.display = 'none';
            link.href = URL.createObjectURL(blob);
            link.download = `${document.name || 'Untitled'}.zip`;

            window.document.body.appendChild(link);
            link.click();

            window.document.body.removeChild(link);
        })
        .catch(console.error);
};

export async function exportFile(
    document: Document,
    getDocumentModel: (documentType: string) => DocumentModel | undefined,
) {
    const documentModel = getDocumentModel(document.documentType);
    if (!documentModel) {
        throw new Error(
            `Document model not supported: ${document.documentType}`,
        );
    }

    const extension = documentModel.utils.fileExtension;

    // Fallback for browsers that don't support showSaveFilePicker
    if (!window.showSaveFilePicker) {
        await downloadFile(document);
        return;
    }

    const fileHandle = await window.showSaveFilePicker({
        suggestedName: `${document.name || 'Untitled'}.${
            extension ? `${extension}.` : ''
        }zip`,
    });

    await documentModel.utils.saveToFileHandle(document, fileHandle);
    const path = (await fileHandle.getFile()).path;
    if (typeof window !== 'undefined') {
        window.electronAPI?.fileSaved(document, path);
    }
    return path;
}

export async function loadFile(
    path: string | File,
    getDocumentModel: (documentType: string) => DocumentModel | undefined,
) {
    const Document = await import('document-model/document');
    const baseDocument = await Document.utils.loadFromInput(
        path,
        (state: Document) => state,
        { checkHashes: true },
    );
    const documentModel = getDocumentModel(baseDocument.documentType);
    if (!documentModel) {
        throw new Error(
            `Document "${baseDocument.documentType}" is not supported`,
        );
    }
    return documentModel.utils.loadFromInput(path);
}
