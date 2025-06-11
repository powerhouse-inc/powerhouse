import connectConfig from '#connect-config';
import { useCallback, useMemo, useState } from 'react';

const namespace = connectConfig.routerBasename;

const ACCEPTED_COOKIES_KEY_STORAGE = `${namespace}:acceptedCookies`;

export interface AcceptedCookies {
    analytics: boolean;
    marketing: boolean;
    functional: boolean;
}

function getAcceptedCookies(): AcceptedCookies {
    try {
        const value = localStorage.getItem(ACCEPTED_COOKIES_KEY_STORAGE);

        return value
            ? (JSON.parse(value) as AcceptedCookies)
            : { analytics: false, marketing: false, functional: false };
    } catch (error) {
        console.error(error);
        return { analytics: false, marketing: false, functional: false };
    }
}

function setAcceptedCookies(cookies: AcceptedCookies) {
    localStorage.setItem(ACCEPTED_COOKIES_KEY_STORAGE, JSON.stringify(cookies));
}

export const useAcceptedCookies = () => {
    const [cookies, _setCookies] = useState(getAcceptedCookies());

    const setCookies = useCallback(
        (setter: (prevCookies: AcceptedCookies) => AcceptedCookies) => {
            const newCookies = setter(cookies);
            setAcceptedCookies(newCookies);
            _setCookies(newCookies);
        },
        [cookies],
    );

    return useMemo(() => [cookies, setCookies] as const, [cookies]);
};
