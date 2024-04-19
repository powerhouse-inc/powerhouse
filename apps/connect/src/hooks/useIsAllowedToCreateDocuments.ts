import { useLogin } from './useLogin';

export function useIsAllowedToCreateDocuments() {
    const { user, status } = useLogin();

    const createDocumentAllowListEnvString = import.meta.env
        .VITE_CREATE_DOCUMENT_ALLOW_LIST;

    const createDocumentAllowList =
        createDocumentAllowListEnvString?.split(',');
    if (createDocumentAllowList === undefined) {
        console.warn(`
                WARNING: The VITE_CREATE_DOCUMENT_ALLOW_LIST environment variable is not set.
                This means that _any_ users will be allowed to create documents.
            `);

        return true;
    }

    if (status !== 'authorized' || !user) return false;

    const userAddressIsOnAllowList = createDocumentAllowList.includes(
        user.address,
    );

    if (userAddressIsOnAllowList) return true;

    return false;
}
