import { logger } from '#services/logger';
import { useGetDocumentModelModule } from '#store/document-model';
import { loadFile } from '#utils/file';
import { PHDocument } from 'document-model';

export function useOpenFile(
    onDocument: (document: PHDocument, file: File) => void,
    onError?: (error: Error) => void,
) {
    const getDocumentModelModule = useGetDocumentModelModule();
    return async () => {
        try {
            const [fileHandle] = await window.showOpenFilePicker();
            const file = await fileHandle.getFile();
            const document = await loadFile(file, getDocumentModelModule);
            if (document) {
                onDocument(document, file);
            } else {
                throw new Error('File was not recognized.');
            }
        } catch (error) {
            logger.error('Error opening file:', error); // TODO improve error handling
            onError?.(error as Error);
        }
    };
}
