import { atomWithStorage } from '#store/utils';

export const ACCEPTED_COOKIES_KEY_STORAGE = 'acceptedCookies';

export interface AcceptedCookies {
    analytics: boolean;
    marketing: boolean;
    functional: boolean;
}

export const acceptedCookiesAtom = atomWithStorage<AcceptedCookies>(
    ACCEPTED_COOKIES_KEY_STORAGE,
    {
        analytics: false,
        marketing: false,
        functional: false,
    },
);
