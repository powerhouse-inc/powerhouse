import { connectConfig } from "@powerhousedao/connect/config";
import { useSyncExternalStore } from "react";

import { getIsEmbedded } from "./useIsEmbedded.js";

const namespace = connectConfig.routerBasename;

/**
 * Block-proof home for Connect's consent and banner state.
 *
 * The file name deliberately avoids words that appear in ad-blocker
 * filter lists (cookie, banner, consent, analytics, ...). Modules in the
 * app's critical import chain import from here, never from files whose
 * URLs match those filters. If an ad blocker blocks the lazy-loaded
 * cookie-banner chunk instead, the app simply never shows the banner —
 * which leaves the flags at their rejected defaults (analytics off) —
 * and everything else keeps working.
 */

// ---------------------------------------------------------------------------
// Accepted cookies (analytics / marketing / functional)
// ---------------------------------------------------------------------------

export const ACCEPTED_COOKIES_KEY_STORAGE = `${namespace}:acceptedCookies`;

export interface AcceptedCookies {
  analytics: boolean;
  marketing: boolean;
  functional: boolean;
}

const REJECTED_COOKIES: AcceptedCookies = {
  analytics: false,
  marketing: false,
  functional: false,
};

const cookieListeners = new Set<() => void>();

let acceptedCookies: AcceptedCookies = getInitialAcceptedCookies();

function getInitialAcceptedCookies(): AcceptedCookies {
  try {
    const value = localStorage.getItem(ACCEPTED_COOKIES_KEY_STORAGE);
    return value ? (JSON.parse(value) as AcceptedCookies) : REJECTED_COOKIES;
  } catch {
    return REJECTED_COOKIES;
  }
}

function subscribeAcceptedCookies(fn: () => void) {
  cookieListeners.add(fn);
  return () => {
    cookieListeners.delete(fn);
  };
}

function getAcceptedCookies(): AcceptedCookies {
  return acceptedCookies;
}

export function setAcceptedCookies(
  setter: (prev: AcceptedCookies) => AcceptedCookies,
) {
  acceptedCookies = setter(acceptedCookies);
  localStorage.setItem(
    ACCEPTED_COOKIES_KEY_STORAGE,
    JSON.stringify(acceptedCookies),
  );
  cookieListeners.forEach((fn) => fn());
}

export const useAcceptedCookies = () => {
  const cookies = useSyncExternalStore(
    subscribeAcceptedCookies,
    getAcceptedCookies,
    getAcceptedCookies,
  );
  return [cookies, setAcceptedCookies] as const;
};

// ---------------------------------------------------------------------------
// Cookie banner visibility
// ---------------------------------------------------------------------------

export const COOKIE_BANNER_KEY_STORAGE = `${namespace}:display-cookie-banner`;

const bannerListeners = new Set<() => void>();

let bannerShown = getInitialBannerShown();

function getInitialBannerShown(): boolean {
  if (getIsEmbedded()) return false;
  try {
    const value = localStorage.getItem(COOKIE_BANNER_KEY_STORAGE);
    return value !== "false";
  } catch (error) {
    console.error(error);
    return true;
  }
}

function subscribeBannerShown(fn: () => void) {
  bannerListeners.add(fn);
  return () => {
    bannerListeners.delete(fn);
  };
}

function getBannerShown(): boolean {
  return bannerShown;
}

export function setBannerShown(state: boolean) {
  bannerShown = state;
  localStorage.setItem(COOKIE_BANNER_KEY_STORAGE, JSON.stringify(state));
  bannerListeners.forEach((fn) => fn());
}

export const useCookieBanner = () => {
  const shown = useSyncExternalStore(
    subscribeBannerShown,
    getBannerShown,
    getBannerShown,
  );
  return [shown, setBannerShown] as const;
};
