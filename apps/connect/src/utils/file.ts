import { logger } from '#services/logger';
import {
    baseLoadFromInput,
    createZip,
    DocumentModelModule,
    PHDocument,
} from 'document-model';

const downloadFile = async (document: PHDocument) => {
    const zip = createZip(document);
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
        .catch(logger.error);
};

export async function exportFile(
    document: PHDocument,
    getDocumentModelModule: (
        documentType: string,
    ) => DocumentModelModule | undefined,
) {
    const documentModel = getDocumentModelModule(document.documentType);
    if (!documentModel) {
        throw new Error(
            `Document model not supported: ${document.documentType}`,
        );
    }

    const extension = documentModel.fileExtension;

    // Fallback for browsers that don't support showSaveFilePicker
    if (!window.showSaveFilePicker) {
        await downloadFile(document);
        return;
    }
    try {
        const fileHandle = await window.showSaveFilePicker({
            // @ts-expect-error - Document model should know that name can be defined in global state
            suggestedName: `${document.name || document.state.global?.name || 'Untitled'}.${
                extension ? `${extension}.` : ''
            }zip`,
        });

        await documentModel.utils.saveToFileHandle(document, fileHandle);
        const path = (await fileHandle.getFile()).path;
        if (typeof window !== 'undefined') {
            window.electronAPI?.fileSaved(document, path);
        }
        return path;
    } catch (e) {
        // ignores error if user cancelled the file picker
        if (!(e instanceof DOMException && e.name === 'AbortError')) {
            throw e;
        }
    }
}

export async function loadFile(
    path: string | File,
    getDocumentModelModule: (
        documentType: string,
    ) => DocumentModelModule | undefined,
) {
    const baseDocument = await baseLoadFromInput(
        path,
        (document: PHDocument) => document,
        { checkHashes: true },
    );
    const documentModel = getDocumentModelModule(baseDocument.documentType);
    if (!documentModel) {
        throw new Error(
            `Document "${baseDocument.documentType}" is not supported`,
        );
    }
    return documentModel.utils.loadFromInput(path);
}
