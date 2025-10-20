import type {
  PHDocumentEditorConfig,
  PHDocumentEditorConfigKey,
  PHDriveEditorConfig,
  PHDriveEditorConfigKey,
  PHGlobalConfig,
  PHGlobalConfigKey,
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

export function useResetPHGlobalConfig(defaultConfigForReset: PHGlobalConfig) {
  return function reset() {
    setPHGlobalConfig(defaultConfigForReset);
  };
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

/** Sets the global drive config.
 *
 * Pass in a partial object of the global drive config to set.
 */
export function setPHDriveEditorConfig(config: Partial<PHDriveEditorConfig>) {
  for (const key of Object.keys(config) as PHDriveEditorConfigKey[]) {
    callGlobalSetterForKey(key, config[key]);
  }
}

/** Sets the global document config.
 *
 * Pass in a partial object of the global document config to set.
 */
export function setPHDocumentEditorConfig(
  config: Partial<PHDocumentEditorConfig>,
) {
  for (const key of Object.keys(config) as PHDocumentEditorConfigKey[]) {
    callGlobalSetterForKey(key, config[key]);
  }
}

/** Wrapper hook for setting the global drive editor config.
 *
 * Automatically sets the global drive editor config when the component mounts.
 *
 * Pass in a partial object of the global drive editor config to set.
 */
export function useSetPHDriveEditorConfig(
  config: Partial<PHDriveEditorConfig>,
) {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (isInitialized) return;
    setPHDriveEditorConfig(config);
    setIsInitialized(true);
  }, [config, isInitialized]);
}

/** Wrapper hook for setting the global document editor config.
 *
 * Automatically sets the global document editor config when the component mounts.
 *
 * Pass in a partial object of the global document editor config to set.
 */
export function useSetPHDocumentEditorConfig(
  config: Partial<PHDocumentEditorConfig>,
) {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (isInitialized) return;
    setPHDocumentEditorConfig(config);
    setIsInitialized(true);
  }, [config, isInitialized]);
}
