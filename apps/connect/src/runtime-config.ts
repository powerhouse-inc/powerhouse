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
  return (await loader.read()) as RuntimePowerhouseConfig;
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
