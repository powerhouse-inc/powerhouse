import { useAtom } from 'jotai';
import { acceptedCookiesAtom } from './atom.js';

export const useAcceptedCookies = () => {
    return useAtom(acceptedCookiesAtom);
};
