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
  // null = the default; the scaffold lists every branding field this way.
  branding: {
    appName: "Powerhouse Connect",
    icon: null,
    loader: null,
  },
  // The generic plugin's (its entry `homeBackground`); null = the bundled
  // gradient.
  home: {
    background: null,
  },
  app: {
    logLevel: "info",
    basePath: "/",
    offline: true,
    studioMode: false,
    cookieBanner: true,
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
    // The explorer's icons: the generic plugin's; null = the built-in icons.
    icons: null,
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
  openPanel: {
    // An empty `clientId` keeps OpenPanel disabled. Enable it per deploy by
    // including `connect.openPanel.clientId` in PH_CONNECT_CONFIG_JSON.
    // `apiUrl` has no default: unset means OpenPanel's hosted API.
    clientId: "",
    trackUiEvents: true,
    trackOperations: true,
  },
  instance: {
    namespace: null,
    reactorWorker: false,
    multiReactor: false,
  },
  reactor: {
    featureFlags: {
      documentDecisions: false,
      authEnforcement: false,
      authGroups: false,
      authConditions: false,
    },
    createSignaturePolicy: "v2-required",
    unsupportedStoredDocuments: "refuse",
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
