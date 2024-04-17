import { atom, useAtom } from 'jotai';
import { useEffect } from 'react';
import { useLogin } from './useLogin';

const isAllowedAtom = atom<boolean>(false);

export function useIsAllowedToCreateDocuments() {
    const [isAllowed, setIsAllowed] = useAtom(isAllowedAtom);
    const { user, status } = useLogin();
    const createDocumentAllowListEnvString = import.meta.env
        .VITE_CREATE_DOCUMENT_ALLOW_LIST;
    const createDocumentAllowList =
        createDocumentAllowListEnvString?.split(',');

    useEffect(() => {
        if (status !== 'authorized' || !user) {
            setIsAllowed(false);
            return;
        }

        const userAddressIsOnAllowList = createDocumentAllowList?.includes(
            user.address,
        );

        if (userAddressIsOnAllowList) {
            setIsAllowed(true);
            return;
        }
    }, [status, user, createDocumentAllowList, setIsAllowed]);

    if (createDocumentAllowList === undefined) {
        console.warn(`
            WARNING: The VITE_CREATE_DOCUMENT_ALLOW_LIST environment variable is not set.
            This means that _any_ users will be allowed to create documents.
        `);
        return true;
    }

    return isAllowed;
}
