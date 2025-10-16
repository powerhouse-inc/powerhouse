import type {
  PHGlobalConfig,
  PHGlobalConfigKey,
  PHGlobalEditorConfig,
  PHGlobalEditorConfigKey,
} from "@powerhousedao/reactor-browser";
import { useEffect, useState } from "react";
import { callGlobalSetterForKey } from "./utils.js";

export function setDefaultPHGlobalConfig(config: PHGlobalConfig) {
  for (const key of Object.keys(config) as PHGlobalConfigKey[]) {
    callGlobalSetterForKey(key, config[key]);
  }
}

export function useSetDefaultPHGlobalConfig(config: PHGlobalConfig) {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (isInitialized) return;
    setDefaultPHGlobalConfig(config);
    setIsInitialized(true);
  }, [config, isInitialized]);
}

export function setPHGlobalConfig(config: Partial<PHGlobalConfig>) {
  for (const key of Object.keys(config) as PHGlobalConfigKey[]) {
    callGlobalSetterForKey(key, config[key]);
  }
}

export function useSetPHGlobalConfig(config: Partial<PHGlobalConfig>) {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (isInitialized) return;
    setPHGlobalConfig(config);
    setIsInitialized(true);
  }, [config, isInitialized]);
}

/** Sets the global user config.
 *
 * Pass in a partial object of the global user config to set.
 */
export function setPHGlobalEditorConfig(config: Partial<PHGlobalEditorConfig>) {
  for (const key of Object.keys(config) as PHGlobalEditorConfigKey[]) {
    callGlobalSetterForKey(key, config[key]);
  }
}

/** Wrapper hook for setting the global user config.
 *
 * Automatically sets the global user config when the component mounts.
 *
 * Pass in a partial object of the global user config to set.
 */
export function useSetPHGlobalEditorConfig(
  config: Partial<PHGlobalEditorConfig>,
) {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (isInitialized) return;
    setPHGlobalEditorConfig(config);
    setIsInitialized(true);
  }, [config, isInitialized]);
}
