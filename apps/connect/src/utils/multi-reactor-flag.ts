import { getRuntimeConfig } from "../runtime-config.js";
import {
  isRuntimeFlagEnabled,
  resolveRuntimeFlag,
  type RuntimeFlagInput,
} from "./runtime-flag.js";

export const MULTI_REACTOR_QUERY_KEY = "multiReactor";
export const MULTI_REACTOR_STORAGE_KEY = "ph:multiReactor";

export type MultiReactorFlagInput = RuntimeFlagInput;

export function resolveMultiReactorEnabled(
  input: MultiReactorFlagInput,
): boolean {
  return resolveRuntimeFlag(input);
}

// Effective flag from config + dev override; a query-param override is persisted
// to localStorage so it survives a refresh.
export function isMultiReactorEnabled(): boolean {
  return isRuntimeFlagEnabled({
    queryKey: MULTI_REACTOR_QUERY_KEY,
    storageKey: MULTI_REACTOR_STORAGE_KEY,
    readConfigFlag: () =>
      getRuntimeConfig().connect.instance?.multiReactor ?? false,
  });
}
