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

/**
 * Default values for every Connect-relevant field. Merged with the
 * `connect.*` block of whatever `powerhouse.config.json` Connect is pointed
 * at, so the SPA never has to guard against undefined fields.
 *
 * Scoped to fields Connect actually reads at runtime — build-time concerns
 * (studio port, switchboard port, reactor.*, auth.*) live in the source
 * config but are not Connect's business and not represented here.
 *
 * Single source of truth for defaults across Connect's runtime read (via
 * ConfigLoader merge), the dist emitter, and the codegen scaffold template.
 */
export const DEFAULT_CONNECT_CONFIG: PHConnectRuntimeConfig = {
  branding: {
    appName: "Powerhouse Connect",
    homeBackground: null,
  },
  app: {
    logLevel: "info",
    basePath: "/",
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
