import { useAtom } from 'jotai';
import { acceptedCookiesAtom } from './atom';

export const useAcceptedCookies = () => {
    return useAtom(acceptedCookiesAtom);
};
