// Narrow subpaths: the shared/connect barrel puts zod and semver on the boot path.
import type { RuntimePowerhouseConfig } from "@powerhousedao/shared/connect";
import { ConfigLoader } from "@powerhousedao/shared/connect/config-loader";
import { JsonConfigAdapter } from "@powerhousedao/shared/connect/json-adapter";
import type { ConnectPluginDefinition } from "../plugins/types.js";
import { getConnectRegistry } from "../registry.js";

// Shared and made on first use: the app's boot copy makes it, with the app's base.
const loader = () =>
  (getConnectRegistry().runtimeConfig ??= new ConfigLoader(
    new JsonConfigAdapter({
      path: `${import.meta.env.BASE_URL}powerhouse.config.json`,
    }),
  ));

export type LoadRuntimeConfigOptions = {
  /** The host's plugin modules: the composition's transform the config, and
   * the active ones' UI loads (every one's without a composition). */
  plugins?: () => Promise<Record<string, ConnectPluginDefinition>>;
};

export async function loadRuntimeConfig(
  options: LoadRuntimeConfigOptions = {},
): Promise<RuntimePowerhouseConfig> {
  const config = (await loader().read()) as RuntimePowerhouseConfig;
  const pluginHost = options.plugins
    ? import("../plugins/plugin-host.js").then((host) => {
        host.registerConnectPlugins(options.plugins!);
        return host;
      })
    : undefined;
  // R3: a served composition (projected from host.js runner.plugins by the
  // uniform-runners connect runner) runs the plugin pipeline over the config
  // BEFORE the cache warms — every downstream consumer sees the transformed
  // config through the classic paths. Runtime-flagged (query/stored override
  // beats the composition's own presence acting as the config flag); no
  // composition = classic boot, byte-identical.
  if (config.connect?.composition) {
    const { isRuntimeFlagEnabled } = await import("./runtime-flag.js");
    const enabled = isRuntimeFlagEnabled({
      queryKey: "pluginRunner",
      storageKey: "ph:flag:pluginRunner",
      readConfigFlag: () => true,
    });
    if (enabled) {
      const { applyComposition } =
        (await pluginHost) ?? (await import("../plugins/plugin-host.js"));
      config.connect = await applyComposition(config.connect);
      loader().prime(config);
    }
  }
  if (pluginHost) {
    await pluginHost;
    const { loadConnectPluginUi } = await import("../plugins/plugin-ui.js");
    await loadConnectPluginUi(config.connect.composition);
  }
  return config;
}

/**
 * Returns the cached config synchronously.
 * Must be called after `loadRuntimeConfig()` has resolved.
 */
export function getRuntimeConfig(): RuntimePowerhouseConfig {
  return loader().getCached() as RuntimePowerhouseConfig;
}

/** Warms the cache with `config` without a fetch, e.g. in a test or an embedding app. */
export function primeRuntimeConfig(config: RuntimePowerhouseConfig) {
  loader().prime(config);
}
