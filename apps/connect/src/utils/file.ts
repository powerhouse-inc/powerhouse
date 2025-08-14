import { logger } from 'document-drive';
import {
    baseLoadFromInput,
    baseSaveToFileHandle,
    createZip,
    type DocumentModelModule,
    type PHDocument,
} from 'document-model';

const downloadFile = async (document: PHDocument) => {
    const zip = createZip(document);
    zip.generateAsync({ type: 'blob' })
        .then(blob => {
            const link = window.document.createElement('a');
            link.style.display = 'none';
            link.href = URL.createObjectURL(blob);
            link.download = `${document.header.name || 'Untitled'}.zip`;

            window.document.body.appendChild(link);
            link.click();

            window.document.body.removeChild(link);
        })
        .catch(logger.error);
};

export async function exportFile(
    document: PHDocument,
    documentModelModule: DocumentModelModule | undefined,
) {
    if (!documentModelModule) {
        throw new Error(
            `Document model not specified: ${document.header.documentType}`,
        );
    }

    const extension = documentModelModule.documentModel.extension;

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

        await baseSaveToFileHandle(document, fileHandle);
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
    documentModelModules: DocumentModelModule[],
) {
    const baseDocument = await baseLoadFromInput(
        path,
        (state: PHDocument) => state,
        { checkHashes: true },
    );
    const documentModelModule = documentModelModules.find(
        module => module.documentModel.id === baseDocument.header.documentType,
    );
    if (!documentModelModule) {
        throw new Error(
            `Document "${baseDocument.header.documentType}" is not supported`,
        );
    }
    return documentModelModule.utils.loadFromInput(path);
}
