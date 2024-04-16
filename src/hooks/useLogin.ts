import { atom, useAtom } from 'jotai';
import { useCallback, useEffect, useMemo } from 'react';
import { useConnectCrypto } from 'src/hooks/useConnectCrypto';
import { useRenown } from 'src/hooks/useRenown';
import {
    RENOWN_CHAIN_ID,
    RENOWN_NETWORK_ID,
    RENOWN_URL,
} from 'src/services/renown/constants';
import { useUser } from 'src/store/user';

type LoginStatus = 'initial' | 'checking' | 'not-authorized' | 'authorized';

const loginStatusAtom = atom<LoginStatus>('initial');

export const useLogin = () => {
    const [status, setStatus] = useAtom(loginStatusAtom);
    const user = useUser();
    const renown = useRenown();
    const { did } = useConnectCrypto();

    const openRenown = useCallback(async () => {
        const connectId = await did();
        const url = new URL(RENOWN_URL);
        url.searchParams.set('connect', connectId);
        url.searchParams.set('network', RENOWN_NETWORK_ID);
        url.searchParams.set('chain', RENOWN_CHAIN_ID);

        if (window.electronAPI) {
            const protocol = await window.electronAPI.protocol();
            url.searchParams.set('deeplink', protocol);
            await window.electronAPI.openURL(url.toString());
        } else {
            const returnUrl = new URL(
                window.location.pathname,
                window.location.origin,
            );
            url.searchParams.set('returnUrl', returnUrl.toJSON());
            window.open(url, '_self')?.focus();
        }
    }, [did]);

    const login = useCallback(
        async (userDid: string) => {
            if (!renown) {
                return;
            }
            try {
                setStatus('checking');
                const user = await renown.user();

                if (user?.did === userDid) {
                    setStatus('authorized');
                    return user;
                }
                const newUser = await renown.login(userDid);
                if (newUser) {
                    setStatus('authorized');
                    return newUser;
                } else {
                    setStatus('not-authorized');
                }
            } catch (error) {
                setStatus('not-authorized');
                console.error(error);
            }
        },
        [renown],
    );

    useEffect(() => {
        if (user && status !== 'authorized') {
            setStatus('authorized');
        }
    }, [user, status]);

    const logout = useCallback(async () => {
        setStatus('initial');
        await renown?.logout();
    }, [renown]);

    return useMemo(
        () =>
            ({
                openRenown,
                user,
                status,
                login: renown ? login : undefined,
                logout,
            }) as const,
        [renown, openRenown, user, status, login, logout],
    );
};
