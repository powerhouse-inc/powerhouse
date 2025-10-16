import type {
  PHGlobalConfigKey,
  PHGlobalEditorConfigKey,
} from "@powerhousedao/reactor-browser";
import { phGlobalConfigHooks } from "./connect.js";
import { phGlobalEditorConfigHooks } from "./editor.js";

export function usePHGlobalConfigByKey<TKey extends PHGlobalConfigKey>(
  key: TKey,
) {
  const useValueHook = phGlobalConfigHooks[key];
  return useValueHook();
}

/** Gets the value of an item in the global user config for a given key.
 *
 * Strongly typed, inferred from type definition for the key.
 */
export function usePHGlobalEditorConfigByKey<
  TKey extends PHGlobalEditorConfigKey,
>(key: TKey) {
  const useValueHook = phGlobalEditorConfigHooks[key];
  return useValueHook();
}
