import type {
  PHAppConfig,
  PHAppConfigKey,
  PHDocumentEditorConfig,
  PHDocumentEditorConfigKey,
  PHGlobalConfig,
  PHGlobalConfigKey,
} from "@powerhousedao/reactor-browser";
import { phGlobalConfigSetters } from "./connect.js";
import { phAppConfigSetters, phDocumentEditorConfigSetters } from "./editor.js";

export function setPHGlobalConfigByKey<TKey extends PHGlobalConfigKey>(
  key: TKey,
  value: PHGlobalConfig[TKey] | undefined,
) {
  const setter = phGlobalConfigSetters[key];
  setter(value);
}

export function setPHAppConfigByKey<TKey extends PHAppConfigKey>(
  key: TKey,
  value: PHAppConfig[TKey] | undefined,
) {
  const setter = phAppConfigSetters[key];
  setter(value);
}

export function setPHDocumentEditorConfigByKey<
  TKey extends PHDocumentEditorConfigKey,
>(key: TKey, value: PHDocumentEditorConfig[TKey] | undefined) {
  const setter = phDocumentEditorConfigSetters[key];
  setter(value);
}
