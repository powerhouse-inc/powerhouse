import { RENOWN_CHAIN_ID, RENOWN_NETWORK_ID, RENOWN_URL } from '#services';
import { useUser } from '#store';
import { useReactor } from '@powerhousedao/state';
import { logger } from 'document-drive';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useConnectCrypto } from './useConnectCrypto.js';
import { useRenown } from './useRenown.js';

type LoginStatus = 'initial' | 'checking' | 'not-authorized' | 'authorized';

export const useLogin = () => {
    const [status, setStatus] = useState<LoginStatus>('initial');
    const user = useUser();
    const renown = useRenown();
    const { did, getBearerToken } = useConnectCrypto();
    const reactor = useReactor();

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

                    reactor?.setGenerateJwtHandler(async driveUrl =>
                        getBearerToken(driveUrl, newUser.address),
                    );

                    return newUser;
                } else {
                    setStatus('not-authorized');
                }
            } catch (error) {
                setStatus('not-authorized');
                logger.error(error);
            }
        },
        [renown, reactor, getBearerToken],
    );

    useEffect(() => {
        if (user && status !== 'authorized') {
            setStatus('authorized');
        }
    }, [user, status]);

    const logout = useCallback(async () => {
        setStatus('initial');
        await renown?.logout();
        reactor?.removeJwtHandler();
    }, [renown, reactor]);

    return useMemo(
        () =>
            ({
                openRenown,
                user,
                status: user ? 'authorized' : status,
                login: renown ? login : undefined,
                logout,
            }) as const,
        [renown, openRenown, user, status, login, logout],
    );
};
