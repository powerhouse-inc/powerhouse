import { useCallback, useMemo, useState } from 'react';
import { useConnectCrypto } from 'src/hooks/useConnectCrypto';
import { useRenown } from 'src/hooks/useRenown';
import { RENOWN_NETWORK_ID, RENOWN_URL } from 'src/services/renown/constants';
import { useUser } from 'src/store/user';

type LoginStatus = 'initial' | 'checking' | 'not-authorized' | 'authorized';

export const useLogin = () => {
    const [status, setStatus] = useState<LoginStatus>('initial');
    const user = useUser();
    const renown = useRenown();
    const { did } = useConnectCrypto();

    const login = useCallback(async () => {
        const connectId = await did();
        const url = new URL(RENOWN_URL);
        url.searchParams.set('connect', connectId);
        url.searchParams.set('network', RENOWN_NETWORK_ID);

        setStatus('checking');
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

    if (user && status !== 'authorized') {
        setStatus('authorized');
    }

    const logout = useMemo(() => renown?.logout, [renown]);

    return useMemo(
        () => ({ user, status, login, logout }) as const,
        [user, status, login, logout],
    );
};
