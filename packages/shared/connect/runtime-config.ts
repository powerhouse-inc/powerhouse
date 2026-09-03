import type {
  PHConnectRuntimeConfig,
  PowerhouseConfig,
  PowerhousePackage,
} from "../clis/types.js";

export type RuntimePowerhouseConfig = {
  schemaVersion: 2;
  packages: PowerhousePackage[];
  packageRegistryUrl?: string;
  localPackage: { name: string; version: string } | null;
  connect: PHConnectRuntimeConfig;
};

/** Defaults for every field Connect reads at runtime, merged into the
 * `connect.*` block at boot; also the dist emitter's and the scaffold's base. */
export const DEFAULT_CONNECT_CONFIG: PHConnectRuntimeConfig = {
  branding: {
    appName: "Powerhouse Connect",
    homeBackground: null,
  },
  app: {
    logLevel: "info",
    basePath: "/",
    offline: true,
    studioMode: false,
  },
  ai: {
    assistantEnabled: false,
  },
  packages: {
    externalEnabled: true,
    liveReload: false,
  },
  drives: {
    allowAddDrive: true,
    defaultDrives: [],
    sections: {
      remote: { enabled: true, allowAdd: true, allowDelete: true },
      local: { enabled: true, allowAdd: true, allowDelete: true },
    },
  },
  renown: {
    url: "https://www.renown.id",
    networkId: "eip155",
    chainId: 1,
  },
  sentry: {
    // `dsn: null` is the disabled-Sentry state — the SPA never loads the
    // Sentry SDK chunk. Override via `ph connect config --sentry-dsn ...`
    // or by including `connect.sentry.dsn` in PH_CONNECT_CONFIG_JSON.
    dsn: null,
    env: "dev",
    tracing: false,
  },
  instance: {
    namespace: null,
    reactorWorker: false,
  },
  reactor: {
    featureFlags: {
      documentDecisions: false,
      authEnforcement: false,
      authGroups: false,
      authConditions: false,
    },
  },
};

export function buildRuntimeConfig(
  source: Pick<PowerhouseConfig, "packages" | "connect" | "packageRegistryUrl">,
  projectInfo: { name: string; version: string } | null,
): RuntimePowerhouseConfig {
  const result: RuntimePowerhouseConfig = {
    schemaVersion: 2,
    packages: source.packages ?? [],
    localPackage: projectInfo,
    connect: source.connect ?? {},
  };
  if (
    typeof source.packageRegistryUrl === "string" &&
    source.packageRegistryUrl !== ""
  ) {
    result.packageRegistryUrl = source.packageRegistryUrl;
  }
  return result;
}
