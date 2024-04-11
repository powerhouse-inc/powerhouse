import { FileNode } from 'document-model-libs/document-drive';
import { getSwitchboardUrl } from 'src/utils/getSwitchboardUrl';
import { openUrl } from 'src/utils/openUrl';
import { useDocumentDriveById } from './useDocumentDriveById';

export const useOpenSwitchboardLink = (driveId: string) => {
    const { isRemoteDrive, remoteUrl } = useDocumentDriveById(driveId);

    return async (document?: FileNode) => {
        if (!remoteUrl) return;
        if (!isRemoteDrive) return;

        const url = new URL(remoteUrl);
        const baseUrl = url.origin;

        if (document) {
            const url = getSwitchboardUrl(
                remoteUrl,
                document.documentType,
                document.id,
            );

            await openUrl(url);
        }
    };
};
