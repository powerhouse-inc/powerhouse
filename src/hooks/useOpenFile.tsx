import { Document } from '@acaldas/document-model-libs/browser/document';
import { loadFile } from 'src/utils/file';

export function useOpenFile(
    onDocument: (document: Document) => void,
    onError?: (error: Error) => void
) {
    return async () => {
        try {
            const [fileHandle] = await window.showOpenFilePicker();
            const file = await fileHandle.getFile();
            const document = await loadFile(file); // TODO handle all documents
            if (document) {
                onDocument(document);
            } else {
                throw new Error('File was not recognized.');
            }
        } catch (error) {
            console.error('Error opening file:', error); // TODO improve error handling
            onError?.(error as Error);
        }
    };
}
