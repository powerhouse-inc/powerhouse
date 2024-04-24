import { useLogin } from './useLogin';

export function useIsAllowedToCreateDocuments() {
    const { user, status } = useLogin();

    const createDocumentAllowListEnvString = import.meta.env
        .VITE_CREATE_DOCUMENT_ALLOW_LIST;

    if (
        createDocumentAllowListEnvString === undefined ||
        createDocumentAllowListEnvString === ''
    ) {
        return true;
    }

    const createDocumentAllowList = createDocumentAllowListEnvString.split(',');
    if (createDocumentAllowList.length === 0) {
        return true;
    }

    if (status !== 'authorized' || !user) return false;

    const userAddressIsOnAllowList = createDocumentAllowList.includes(
        user.address,
    );

    if (userAddressIsOnAllowList) return true;

    return false;
}
