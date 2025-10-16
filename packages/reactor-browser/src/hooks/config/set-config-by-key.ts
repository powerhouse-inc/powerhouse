import type {
  PHGlobalConfig,
  PHGlobalConfigKey,
  PHGlobalEditorConfig,
  PHGlobalEditorConfigKey,
} from "@powerhousedao/reactor-browser";
import { phGlobalConfigSetters } from "./connect.js";
import { phGlobalEditorConfigSetters } from "./editor.js";

export function setPHGlobalConfigByKey<TKey extends PHGlobalConfigKey>(
  key: TKey,
  value: PHGlobalConfig[TKey] | undefined,
) {
  const setter = phGlobalConfigSetters[key];
  setter(value);
}

export function setPHGlobalEditorConfigByKey<
  TKey extends PHGlobalEditorConfigKey,
>(key: TKey, value: PHGlobalEditorConfig[TKey] | undefined) {
  const setter = phGlobalEditorConfigSetters[key];
  setter(value);
}
