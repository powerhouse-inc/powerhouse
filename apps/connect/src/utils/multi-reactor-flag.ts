import { getRuntimeConfig } from "../runtime-config.js";

// Config only: the flag is in the worker fingerprint, so a per-tab value would split tabs.
export function isMultiReactorEnabled(): boolean {
  return getRuntimeConfig().connect.instance?.multiReactor ?? false;
}
