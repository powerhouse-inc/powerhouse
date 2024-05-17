import { useAllowList } from './useAllowList';

export function useUserPermissions() {
    const { isAllowed, allowListType } = useAllowList();

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
