import { getRuntimeConfig } from "../runtime-config.js";
import {
  isRuntimeFlagEnabled,
  resolveRuntimeFlag,
  type RuntimeFlagInput,
} from "./runtime-flag.js";

export const REACTOR_WORKER_QUERY_KEY = "reactorWorker";
export const REACTOR_WORKER_STORAGE_KEY = "ph:reactorWorker";

export type ReactorWorkerFlagInput = RuntimeFlagInput;

export function resolveReactorWorkerEnabled(
  input: ReactorWorkerFlagInput,
): boolean {
  return resolveRuntimeFlag(input);
}

export function isReactorWorkerEnabled(): boolean {
  return isRuntimeFlagEnabled({
    queryKey: REACTOR_WORKER_QUERY_KEY,
    storageKey: REACTOR_WORKER_STORAGE_KEY,
    readConfigFlag: () =>
      getRuntimeConfig().connect.instance?.reactorWorker ?? false,
  });
}
