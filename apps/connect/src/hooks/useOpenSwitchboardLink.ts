import { useUnwrappedReactor } from '#store';
import { openUrl } from '#utils';
import { useNodeDocumentType } from '@powerhousedao/common';
import { useSwitchboard } from '@powerhousedao/reactor-browser';
import { useDocumentDriveById } from './useDocumentDriveById.js';

export const useOpenSwitchboardLink = (
    driveId: string | undefined | null,
    nodeId: string | null,
) => {
    const { isRemoteDrive, remoteUrl } = useDocumentDriveById(driveId);
    const reactor = useUnwrappedReactor();
    const { getDocumentGraphqlQuery, getSwitchboardGatewayUrl } =
        useSwitchboard(reactor!);
    const documentType = useNodeDocumentType(nodeId);

    return async () => {
        if (!nodeId || !documentType || !remoteUrl || !isRemoteDrive) return;

        const url = new URL(remoteUrl);
        const baseUrl = url.origin;

        const switchboardUrl = getSwitchboardGatewayUrl(remoteUrl);
        const query = await getDocumentGraphqlQuery(driveId!, nodeId);

        const encodedQuery = encodeURIComponent(query);

        await openUrl(`${switchboardUrl}?query=${encodedQuery}`);
    };
};
