import { useAllowList } from './useAllowList.js';

export function useUserPermissions() {
    const allowList = useAllowList();

    if (!allowList) {
        return undefined;
    }

    const { allowListType, isAllowed } = allowList;

    if (allowListType === 'arbitrum') {
        return {
            isAllowedToCreateDocuments: isAllowed,
            isAllowedToEditDocuments: true,
        };
    }

    if (allowListType === 'rwa') {
        return {
            isAllowedToCreateDocuments: isAllowed,
            isAllowedToEditDocuments: isAllowed,
        };
    }

    return {
        isAllowedToCreateDocuments: true,
        isAllowedToEditDocuments: true,
    };
}
