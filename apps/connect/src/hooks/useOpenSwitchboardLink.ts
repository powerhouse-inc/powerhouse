import { openUrl } from '#utils';
import { FILE, type UiNode } from '@powerhousedao/design-system';
import { useDocumentDriveById } from './useDocumentDriveById.js';
import { useDocumentDriveServer } from './useDocumentDriveServer.js';
import { useSwitchboard } from './useSwitchboard.js';

export const useOpenSwitchboardLink = (driveId: string | undefined) => {
    const { isRemoteDrive, remoteUrl } = useDocumentDriveById(driveId);
    const { getSwitchboardGatewayUrl } = useSwitchboard();
    const { getDocumentModelGraphQLSchema } = useDocumentDriveServer();

    return async (uiNode?: UiNode | null) => {
        if (uiNode?.kind !== FILE || !remoteUrl || !isRemoteDrive) return;

        const switchboardGatewayUrl = await getSwitchboardGatewayUrl(remoteUrl);
        const graphQLSchema = await getDocumentModelGraphQLSchema(
            uiNode.documentType,
        );

        // encode query
        const encodedQuery = encodeURIComponent(graphQLSchema);

        await openUrl(switchboardGatewayUrl + `?query=${encodedQuery}`);
    };
};
