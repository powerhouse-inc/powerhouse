import { openUrl } from '#utils';
import {
    unwrapLoadable,
    useDriveIsRemote,
    useDriveRemoteUrl,
    useUnwrappedReactor,
} from '@powerhousedao/common';
import { useSwitchboard } from '@powerhousedao/reactor-browser';

export const useOpenSwitchboardLink = (
    driveId: string | undefined | null,
    documentId: string | null,
) => {
    const loadableIsRemoteDrive = useDriveIsRemote(driveId ?? null);
    const isRemoteDrive = unwrapLoadable(loadableIsRemoteDrive);
    const loadableDriveRemoteUrl = useDriveRemoteUrl(driveId ?? null);
    const remoteUrl = unwrapLoadable(loadableDriveRemoteUrl);
    const reactor = useUnwrappedReactor();
    const { getDocumentGraphqlQuery, getSwitchboardGatewayUrl } =
        useSwitchboard(reactor!);

    return async () => {
        if (!documentId || !remoteUrl || !isRemoteDrive) return;

        const url = new URL(remoteUrl);
        const baseUrl = url.origin;

        const switchboardUrl = getSwitchboardGatewayUrl(remoteUrl);
        const query = await getDocumentGraphqlQuery(driveId!, documentId);

        const encodedQuery = encodeURIComponent(query);

        await openUrl(`${switchboardUrl}?query=${encodedQuery}`);
    };
};
