import { atom, useAtom } from 'jotai';
import { useEffect } from 'react';
import { useLogin } from './useLogin';

const isAllowedAtom = atom<boolean>(false);

export function useIsAllowedToCreateDocuments() {
    const [isAllowed, setIsAllowed] = useAtom(isAllowedAtom);
    const { user, status } = useLogin();
    const createDocumentWhitelistEnvString = import.meta.env
        .VITE_CREATE_DOCUMENT_WHITE_LIST;
    const createDocumentWhitelist =
        createDocumentWhitelistEnvString?.split(',');

    useEffect(() => {
        if (status !== 'authorized' || !user) {
            setIsAllowed(false);
            return;
        }

        const userAddressIsOnWhitelist = createDocumentWhitelist?.includes(
            user.address,
        );

        if (userAddressIsOnWhitelist) {
            setIsAllowed(true);
            return;
        }
    });

    if (createDocumentWhitelist === undefined) {
        console.warn(`
            WARNING: The VITE_CREATE_DOCUMENT_WHITE_LIST environment variable is not set.
            This means that _any_ users will be allowed to create documents.
        `);
        return true;
    }

    return isAllowed;
}
