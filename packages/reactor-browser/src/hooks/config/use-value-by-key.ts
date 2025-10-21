import type {
  PHDocumentEditorConfigKey,
  PHDriveEditorConfigKey,
  PHGlobalConfigKey,
} from "@powerhousedao/reactor-browser";
import { phGlobalConfigHooks } from "./connect.js";
import {
  phDocumentEditorConfigHooks,
  phDriveEditorConfigHooks,
} from "./editor.js";

export function usePHGlobalConfigByKey<TKey extends PHGlobalConfigKey>(
  key: TKey,
) {
  const useValueHook = phGlobalConfigHooks[key];
  return useValueHook();
}

/** Gets the value of an item in the global drive config for a given key.
 *
 * Strongly typed, inferred from type definition for the key.
 */
export function usePHDriveEditorConfigByKey<
  TKey extends PHDriveEditorConfigKey,
>(key: TKey) {
  const useValueHook = phDriveEditorConfigHooks[key];
  return useValueHook();
}

/** Gets the value of an item in the global document config for a given key.
 *
 * Strongly typed, inferred from type definition for the key.
 */
export function usePHDocumentEditorConfigByKey<
  TKey extends PHDocumentEditorConfigKey,
>(key: TKey) {
  const useValueHook = phDocumentEditorConfigHooks[key];
  return useValueHook();
}
