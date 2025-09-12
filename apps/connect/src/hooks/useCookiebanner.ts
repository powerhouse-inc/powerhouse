import { connectConfig } from "@powerhousedao/connect/config";
import { useSyncExternalStore } from "react";

const namespace = connectConfig.routerBasename;

export const COOKIE_BANNER_KEY_STORAGE = `${namespace}:display-cookie-banner`;

const listeners = new Set<() => void>();

let bannerShown = getInitial();

function getInitial(): boolean {
  try {
    const value = localStorage.getItem(COOKIE_BANNER_KEY_STORAGE);
    return value !== "false";
  } catch (error) {
    console.error(error);
    return true;
  }
}

function getCookieBannerState(): boolean {
  return bannerShown;
}

function setCookieBannerState(state: boolean) {
  bannerShown = state;
  localStorage.setItem(COOKIE_BANNER_KEY_STORAGE, JSON.stringify(state));
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const useCookieBanner = () => {
  const cookieBannerShown = useSyncExternalStore(
    subscribe,
    getCookieBannerState,
    getCookieBannerState,
  );
  return [cookieBannerShown, setCookieBannerState] as const;
};
