// Narrow subpaths: the shared/connect barrel puts zod and semver on the boot path.
import type { RuntimePowerhouseConfig } from "@powerhousedao/shared/connect";
import { ConfigLoader } from "@powerhousedao/shared/connect/config-loader";
import { JsonConfigAdapter } from "@powerhousedao/shared/connect/json-adapter";
import { resolveOriginPlaceholders } from "@powerhousedao/shared/connect/origin-placeholder";
import type { ConnectPluginDefinition } from "../plugins/types.js";
import { getConnectRegistry } from "../registry.js";

// Shared and made on first use: the app's boot copy makes it, with the app's base.
const loader = () =>
  (getConnectRegistry().runtimeConfig ??= new ConfigLoader(
    new JsonConfigAdapter({
      // Optional: Node runs this file untransformed when it prerenders the shell.
      path: `${import.meta.env?.BASE_URL ?? "/"}powerhouse.config.json`,
    }),
  ));

export type LoadRuntimeConfigOptions = {
  /** The host's plugin modules: the composition's transform the config, and
   * their UI loads. */
  plugins?: () => Promise<Record<string, ConnectPluginDefinition>>;
};

export async function loadRuntimeConfig(
  options: LoadRuntimeConfigOptions = {},
): Promise<RuntimePowerhouseConfig> {
  // Beside the config's fetch: the plugin modules and the UI loader don't
  // depend on it; only which plugins' UI loads does.
  const pluginHost = options.plugins
    ? import("../plugins/plugin-host.js").then(async (host) => {
        host.registerConnectPlugins(options.plugins!);
        await host.knownPlugins();
        return host;
      })
    : undefined;
  const pluginUi = options.plugins
    ? import("../plugins/plugin-ui.js")
    : undefined;
  // Handled here so a failed config read doesn't leave them unhandled.
  void pluginHost?.catch(() => undefined);
  void pluginUi?.catch(() => undefined);
  let config = (await loader().read()) as RuntimePowerhouseConfig;
  // A served config names a switchboard this page's server proxies as
  // `${origin}` (the connect runner's `runner.proxy`): resolved here, once,
  // against the page's origin, so every consumer sees absolute URLs and the
  // same config holds from localhost and from a published site alike. Not
  // in Node (the shell prerender): there is no page origin to resolve to.
  const origin = globalThis.location?.origin;
  if (origin) {
    config = resolveOriginPlaceholders(config, origin);
    loader().prime(config);
  }
  // R3: the composition (projected from host.js runner.plugins by the connect
  // runner) runs the plugin pipeline over the config BEFORE the cache warms:
  // every downstream consumer sees the transformed config. A config served
  // without one (a build nothing overrides) boots the default composition,
  // worked out here by the function `ph run`'s dev and serve use.
  let composition = config.connect.composition;
  if (!composition) {
    const { defaultConnectComposition } =
      await import("@powerhousedao/host-core/plugins");
    composition = defaultConnectComposition(config.connect);
    config.connect = { ...config.connect, composition };
  }
  const { applyComposition } =
    (await pluginHost) ?? (await import("../plugins/plugin-host.js"));
  config.connect = await applyComposition(config.connect);
  loader().prime(config);
  if (pluginHost && pluginUi) {
    await pluginHost;
    const { loadConnectPluginUi } = await pluginUi;
    await loadConnectPluginUi(composition);
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
