import {
  ConfigLoader,
  JsonConfigAdapter,
  type RuntimePowerhouseConfig,
} from "@powerhousedao/shared/connect";

const loader = new ConfigLoader(
  new JsonConfigAdapter({
    path: `${import.meta.env.BASE_URL}powerhouse.config.json`,
  }),
);

export async function loadRuntimeConfig(): Promise<RuntimePowerhouseConfig> {
  const config = (await loader.read()) as RuntimePowerhouseConfig;
  // R3: a served composition (projected from host.js runner.plugins by the
  // uniform-runners connect runner) runs the plugin pipeline over the config
  // BEFORE the cache warms — every downstream consumer sees the transformed
  // config through the classic paths. Runtime-flagged (query/stored override
  // beats the composition's own presence acting as the config flag); no
  // composition = classic boot, byte-identical.
  if (config.connect?.composition) {
    const { isRuntimeFlagEnabled } = await import("./utils/runtime-flag.js");
    const enabled = isRuntimeFlagEnabled({
      queryKey: "pluginRunner",
      storageKey: "ph:flag:pluginRunner",
      readConfigFlag: () => true,
    });
    if (enabled) {
      const { applyComposition } = await import("./plugin-host.js");
      config.connect = await applyComposition(config.connect);
      loader.prime(config);
    }
  }
  return config;
}

/**
 * Returns the cached config synchronously.
 * Must be called after `loadRuntimeConfig()` has resolved.
 */
export function getRuntimeConfig(): RuntimePowerhouseConfig {
  return loader.getCached() as RuntimePowerhouseConfig;
}

export function applyConnectBranding(config: RuntimePowerhouseConfig): void {
  const appName = config.connect.branding?.appName;
  if (appName) document.title = appName;
}
