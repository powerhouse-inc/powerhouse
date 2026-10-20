import { loadRuntimeConfig as loadCoreRuntimeConfig } from "@powerhousedao/connect-core/runtime-config";

// The built-ins: a declared composition's transform the config, and the active
// ones' UI loads (every one's without a composition).
const connectPlugins = () =>
  import("./plugins/index.js").then((m) => m.connectPlugins);

/** Core's loader, with Connect's built-in plugins for the composition. */
export function loadRuntimeConfig() {
  return loadCoreRuntimeConfig({ plugins: connectPlugins });
}
