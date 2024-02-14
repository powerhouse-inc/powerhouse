import { useDocumentDriveServer } from './useDocumentDriveServer';

export function useGetDocumentById() {
    const { documentDrives } = useDocumentDriveServer();

    return (driveID: string, documentId: string) => {
        const drive = documentDrives.find(
            drive => drive.state.global.id === driveID,
        );

        return drive?.state.global.nodes.find(node => node.id === documentId);
    };
}
