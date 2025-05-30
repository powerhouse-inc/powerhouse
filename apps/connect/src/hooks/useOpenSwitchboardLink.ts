import { getSwitchboardUrl, openUrl } from '#utils';
import { useNodeDocumentType } from '@powerhousedao/reactor-browser';
import { useDocumentDriveById } from './useDocumentDriveById.js';

export const useOpenSwitchboardLink = (
    driveId: string | undefined | null,
    nodeId: string | null,
) => {
    const { isRemoteDrive, remoteUrl } = useDocumentDriveById(driveId);
    const documentType = useNodeDocumentType(nodeId);

    return async () => {
        if (!nodeId || !documentType || !remoteUrl || !isRemoteDrive) return;

        const url = new URL(remoteUrl);
        const baseUrl = url.origin;

        const switchboardUrl = getSwitchboardUrl(
            remoteUrl,
            documentType,
            nodeId,
        );

        await openUrl(switchboardUrl);
    };
};
