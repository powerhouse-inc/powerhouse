import { usePermissions, useSetPermissions } from '@powerhousedao/common';
import { useEffect } from 'react';
import { useAllowList } from './useAllowList.js';

export function useUserPermissions() {
    const allowList = useAllowList();
    const permissions = usePermissions();
    const setPermissions = useSetPermissions();

    useEffect(() => {
        if (!allowList) {
            return;
        }

        const { allowListType, isAllowed } = allowList;

        if (allowListType === 'arbitrum') {
            setPermissions({
                isAllowedToCreateDocuments: isAllowed,
                isAllowedToEditDocuments: true,
            });
        }

        if (allowListType === 'rwa') {
            setPermissions({
                isAllowedToCreateDocuments: isAllowed,
                isAllowedToEditDocuments: isAllowed,
            });
        }
    }, [allowList]);

    return permissions;
}
