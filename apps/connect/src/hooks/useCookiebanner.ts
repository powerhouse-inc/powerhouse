import connectConfig from '#connect-config';
import { useCallback, useMemo, useState } from 'react';

const namespace = connectConfig.routerBasename;

export const COOKIE_BANNER_KEY_STORAGE = `${namespace}:display-cookie-banner`;

function getCookieBannerState(): boolean {
    try {
        const value = localStorage.getItem(COOKIE_BANNER_KEY_STORAGE);
        return value !== 'false';
    } catch (error) {
        console.error(error);
        return true;
    }
}

function setCookieBannerState(state: boolean) {
    localStorage.setItem(COOKIE_BANNER_KEY_STORAGE, JSON.stringify(state));
}

export const useCookieBanner = () => {
    const [cookieBannerShown, _setCookieBannerShown] = useState(
        getCookieBannerState(),
    );

    const setCookieBanner = useCallback((state: boolean) => {
        setCookieBannerState(state);
        _setCookieBannerShown(state);
    }, []);

    return useMemo(
        () => [cookieBannerShown, setCookieBanner] as const,
        [cookieBannerShown],
    );
};
