import type {
  PHGlobalConfig,
  PHGlobalConfigKey,
  PHGlobalConfigSetters,
} from "@powerhousedao/reactor-browser";
import { phGlobalConfigSetters } from "./connect.js";

export function callGlobalSetterForKey<TKey extends PHGlobalConfigKey>(
  key: TKey,
  value: PHGlobalConfig[TKey] | undefined,
) {
  const setter = phGlobalConfigSetters[key] as PHGlobalConfigSetters[TKey];
  setter(value);
}
