import { subscribeToAppConfig } from "@powerhousedao/reactor-browser";
import { useSyncExternalStore } from "react";

export function useAppConfig() {
  return useSyncExternalStore(subscribeToAppConfig, () => window.phAppConfig);
}

export function useShowSearchBar() {
  const appConfig = useAppConfig();
  return appConfig?.showSearchBar ?? false;
}

export function useAnalyticsDatabaseName() {
  const appConfig = useAppConfig();
  return appConfig?.analyticsDatabaseName;
}

export function useAllowList() {
  const appConfig = useAppConfig();
  return appConfig?.allowList;
}
