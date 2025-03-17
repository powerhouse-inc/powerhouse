import { getSwitchboardUrl, openUrl } from '#utils';
import { FILE, type UiNode } from '@powerhousedao/design-system';
import { useDocumentDriveById } from './useDocumentDriveById.js';

export const useOpenSwitchboardLink = (driveId: string | undefined) => {
    const { isRemoteDrive, remoteUrl } = useDocumentDriveById(driveId);

    return async (uiNode?: UiNode | null) => {
        if (uiNode?.kind !== FILE || !remoteUrl || !isRemoteDrive) return;

        const url = new URL(remoteUrl);
        const baseUrl = url.origin;

        const switchboardUrl = getSwitchboardUrl(
            remoteUrl,
            uiNode.documentType,
            uiNode.id,
        );

        await openUrl(switchboardUrl);
    };
};
