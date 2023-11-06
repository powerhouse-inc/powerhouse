import { Document } from 'document-model/document';
import { useGetDocumentModel } from 'src/store/document-model';
import { loadFile } from 'src/utils/file';

export function useOpenFile(
    onDocument: (document: Document, file: File) => void,
    onError?: (error: Error) => void
) {
    const getDocumentModel = useGetDocumentModel();
    return async () => {
        try {
            const [fileHandle] = await window.showOpenFilePicker();
            const file = await fileHandle.getFile();
            const document = await loadFile(file, getDocumentModel);
            if (document) {
                onDocument(document, file);
            } else {
                throw new Error('File was not recognized.');
            }
        } catch (error) {
            console.error('Error opening file:', error); // TODO improve error handling
            onError?.(error as Error);
        }
    };
}
