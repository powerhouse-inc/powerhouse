import { useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import { configAtom } from "./atoms.js";
import { type ConnectConfig } from "./types.js";

export function useConfig() {
  return useAtomValue(configAtom);
}

function useSetConfig() {
  return useSetAtom(configAtom);
}

export function useInitializeConfig(config: ConnectConfig) {
  const setConfig = useSetConfig();
  useEffect(() => {
    setConfig(config);
  }, [config, setConfig]);
}

export function useShouldShowSearchBar() {
  const config = useConfig();
  return config.content.showSearchBar;
}
