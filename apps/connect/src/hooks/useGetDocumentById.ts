import { Node } from 'document-drive';
import { useDocumentDriveServer } from './useDocumentDriveServer';

export function useGetDocumentById(): (
    driveID: string,
    documentId: string,
) => Node | undefined {
    const { documentDrives } = useDocumentDriveServer();

    return (driveID: string, documentId: string) => {
        const drive = documentDrives.find(
            drive => drive.state.global.id === driveID,
        );

        return drive?.state.global.nodes.find(node => node.id === documentId);
    };
}
