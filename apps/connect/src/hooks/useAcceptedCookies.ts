import connectConfig from '#connect-config';
import { useSyncExternalStore } from 'react';

const namespace = connectConfig.routerBasename;

const ACCEPTED_COOKIES_KEY_STORAGE = `${namespace}:acceptedCookies`;

export interface AcceptedCookies {
    analytics: boolean;
    marketing: boolean;
    functional: boolean;
}

const listeners = new Set<() => void>();

let cookies: AcceptedCookies = getInitial();

function getInitial(): AcceptedCookies {
    try {
        const value = localStorage.getItem(ACCEPTED_COOKIES_KEY_STORAGE);
        return value
            ? (JSON.parse(value) as AcceptedCookies)
            : { analytics: false, marketing: false, functional: false };
    } catch {
        return { analytics: false, marketing: false, functional: false };
    }
}

function getCookies(): AcceptedCookies {
    return cookies;
}

function setCookies(setter: (prev: AcceptedCookies) => AcceptedCookies) {
    cookies = setter(cookies);
    localStorage.setItem(ACCEPTED_COOKIES_KEY_STORAGE, JSON.stringify(cookies));
    listeners.forEach(fn => fn());
}

function subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

export const useAcceptedCookies = () => {
    const cookies = useSyncExternalStore(subscribe, getCookies, getCookies);
    return [cookies, setCookies] as const;
};
