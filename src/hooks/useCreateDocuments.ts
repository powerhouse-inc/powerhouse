import {
    decodeID,
    getRootPath,
    useGetItemByPath,
} from '@powerhousedao/design-system';
import { useSelectedPath } from 'src/store/document-drive';
import { useFilteredDocumentModels } from 'src/store/document-model';
import { useDocumentDriveServer } from './useDocumentDriveServer';

export const useCreateDocuments = () => {
    const { addDocument } = useDocumentDriveServer();
    const [selectedPath] = useSelectedPath();
    const getItemByPath = useGetItemByPath();
    const documentModels = useFilteredDocumentModels();

    const selectedFolder = getItemByPath(selectedPath || '');
    const driveID = getRootPath(selectedFolder?.path ?? '');
    const decodedDriveID = decodeID(driveID);

    const parentFolder = selectedFolder
        ? selectedFolder.path.split('/').slice(1).pop()
        : undefined;

    return async (amount: number) => {
        for (let i = 0; i < amount; i++) {
            await addDocument(
                decodedDriveID,
                `document-${i}`,
                documentModels[0].documentModel.id,
                parentFolder ? decodeID(parentFolder) : undefined,
            );
        }
    };
};
