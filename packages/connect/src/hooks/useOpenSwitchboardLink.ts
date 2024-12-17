import { FILE, UiNode } from '@powerhousedao/design-system';
import { getSwitchboardUrl } from 'src/utils/getSwitchboardUrl';
import { openUrl } from 'src/utils/openUrl';
import { useDocumentDriveById } from './useDocumentDriveById';

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
