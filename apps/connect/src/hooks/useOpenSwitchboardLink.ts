import { useUnwrappedReactor } from '#store';
import { openUrl } from '#utils';
import { FILE, type UiNode } from '@powerhousedao/design-system';
import { useSwitchboard } from '@powerhousedao/reactor-browser';
import { useDocumentDriveById } from './useDocumentDriveById.js';

export const useOpenSwitchboardLink = (driveId: string | undefined) => {
    const { isRemoteDrive, remoteUrl } = useDocumentDriveById(driveId);
    const reactor = useUnwrappedReactor();
    const { getDocumentGraphqlQuery, getSwitchboardGatewayUrl } =
        useSwitchboard(reactor!);

    return async (uiNode?: UiNode | null) => {
        if (uiNode?.kind !== FILE || !remoteUrl || !isRemoteDrive) return;

        const url = new URL(remoteUrl);
        const baseUrl = url.origin;

        const switchboardUrl = getSwitchboardGatewayUrl(remoteUrl);
        const query = await getDocumentGraphqlQuery(driveId!, uiNode.id);

        const encodedQuery = encodeURIComponent(query);

        await openUrl(`${switchboardUrl}?query=${encodedQuery}`);
    };
};
