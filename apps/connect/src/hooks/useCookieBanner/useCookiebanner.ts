import { useAtom } from 'jotai';
import { cookieBannerAtom } from './atom.js';

export const useCookieBanner = () => {
    return useAtom(cookieBannerAtom);
};
