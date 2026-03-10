import { useSyncExternalStore } from "react";
import type {
  BrowserPackageLoader,
  DismissedPackage,
  PendingInstallation,
} from "../loaders/browser-package-loader.js";
import { makePHEventFunctions } from "./make-ph-event-functions.js";

const browserPackageLoaderFunctions = makePHEventFunctions(
  "browserPackageLoader",
);

export const useBrowserPackageLoader = browserPackageLoaderFunctions.useValue;
export const setBrowserPackageLoader = browserPackageLoaderFunctions.setValue;
export const addBrowserPackageLoaderEventHandler =
  browserPackageLoaderFunctions.addEventHandler;

const EMPTY_PENDING: PendingInstallation[] = [];
const EMPTY_DISMISSED: DismissedPackage[] = [];
const NOOP_UNSUBSCRIBE = () => {};

export function usePendingInstallations(): PendingInstallation[] {
  const loader = useBrowserPackageLoader() as BrowserPackageLoader | undefined;

  return useSyncExternalStore(
    (cb) => (loader ? loader.subscribe(cb) : NOOP_UNSUBSCRIBE),
    () => loader?.getPendingInstallations() ?? EMPTY_PENDING,
  );
}

export function useDismissedPackages(): DismissedPackage[] {
  const loader = useBrowserPackageLoader() as BrowserPackageLoader | undefined;

  return useSyncExternalStore(
    (cb) => (loader ? loader.subscribe(cb) : NOOP_UNSUBSCRIBE),
    () => loader?.getDismissedPackages() ?? EMPTY_DISMISSED,
  );
}
