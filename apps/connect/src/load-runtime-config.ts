import { loadRuntimeConfig as loadCoreRuntimeConfig } from "@powerhousedao/connect-core/runtime-config";

// The built-ins: the composition's transform the config, and their UI loads.
const connectPlugins = () =>
  import("./plugins/index.js").then((m) => m.connectPlugins);

/** Core's loader, with Connect's built-in plugins for the composition. */
export function loadRuntimeConfig() {
  return loadCoreRuntimeConfig({ plugins: connectPlugins });
}
