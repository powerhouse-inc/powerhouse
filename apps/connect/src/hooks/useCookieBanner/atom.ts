import { atomWithStorage } from '#store';

export const COOKIE_BANNER_KEY_STORAGE = 'display-cookie-banner';

export const cookieBannerAtom = atomWithStorage<boolean>(
    COOKIE_BANNER_KEY_STORAGE,
    true,
);
