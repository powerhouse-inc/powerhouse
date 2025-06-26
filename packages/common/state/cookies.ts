import { useAtomValue, useSetAtom } from "jotai";
import { acceptedCookiesAtom, displayCookieBannerAtom } from "./atoms.js";

export const useAcceptedCookies = () => useAtomValue(acceptedCookiesAtom);
export const useSetAcceptedCookies = () => useSetAtom(acceptedCookiesAtom);

export const useCookieBanner = () => useAtomValue(displayCookieBannerAtom);
export const useSetCookieBanner = () => useSetAtom(displayCookieBannerAtom);
