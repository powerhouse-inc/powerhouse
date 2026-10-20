import { loadRuntimeConfig as loadCoreRuntimeConfig } from "@powerhousedao/connect-core/runtime-config";

// The built-ins load only when the served config declares a composition.
const connectPlugins = () =>
  import("./plugins/index.js").then((m) => m.connectPlugins);

/** Core's loader, with Connect's built-in plugins for the composition. */
export function loadRuntimeConfig() {
  return loadCoreRuntimeConfig({ plugins: connectPlugins });
}
