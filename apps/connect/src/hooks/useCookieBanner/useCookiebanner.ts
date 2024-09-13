import { useAtom } from 'jotai';
import { cookieBannerAtom } from './atom';

export const useCookieBanner = () => {
    return useAtom(cookieBannerAtom);
};
