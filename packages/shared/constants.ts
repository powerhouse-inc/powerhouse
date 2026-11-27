/**
 * The Renown every built-in default signs in at: the SDK, the CLIs, Connect,
 * the switchboard and the registry read it, and the generated schemas and
 * static configs carry it (the guard in constants.test.ts lists them).
 *
 * The 6.4 line uses renown.id on staging until renown.id runs in production;
 * then it returns to https://www.renown.id (decided 11-26). Only the base
 * address: the SDK discovers the GraphQL endpoint (`/api/switchboard`).
 *
 * Here, not in clis/constants.ts (which re-exports it), so browser code
 * reaches it without node builtins. Not `as const`: a parameter that
 * defaults to it takes any address.
 */
export const DEFAULT_RENOWN_URL = "https://renown-staging.vetra.io";

/**
 * Where `ph login` logged in before Powerhouse 6.4, whatever the default is
 * now: the logins a project kept from then were made there, and `ph migrate`
 * withdraws them there.
 */
export const LEGACY_RENOWN_URL = "https://www.renown.id";

// Every package published from the monorepo that `ph update` / `ph use` keep in lockstep.
export const PACKAGES_DEPENDENCIES = [
  "@powerhousedao/builder-tools",
  "@powerhousedao/clint",
  "@powerhousedao/clint-common",
  "@powerhousedao/codegen",
  "@powerhousedao/common",
  "@powerhousedao/config",
  "@powerhousedao/connect-core",
  "@powerhousedao/design-system",
  "@powerhousedao/desktop",
  "@powerhousedao/devtools",
  "@powerhousedao/host-core",
  "document-drive",
  "document-model",
  "@powerhousedao/opentelemetry-instrumentation-reactor",
  "@powerhousedao/pieces-framework",
  "@powerhousedao/portle",
  "@powerhousedao/reactor",
  "@powerhousedao/reactor-api",
  "@powerhousedao/reactor-attachments",
  "@powerhousedao/reactor-browser",
  "@powerhousedao/reactor-drive",
  "@powerhousedao/reactor-group",
  "@powerhousedao/reactor-hypercore",
  "@powerhousedao/reactor-mcp",
  "@powerhousedao/reactor-privacy",
  "@powerhousedao/reactor-router",
  "@powerhousedao/reactor-workflow",
  "@powerhousedao/registry",
  "@powerhousedao/switchboard-gui",
  "@powerhousedao/vetra",
  "@powerhousedao/vetra-studio",
  "@powerhousedao/workflow",
  "@powerhousedao/analytics-engine-core",
  "@powerhousedao/analytics-engine-knex",
  "@powerhousedao/analytics-engine-pg",
  "@powerhousedao/analytics-engine-browser",
  "@powerhousedao/analytics-engine-graphql",
  "@powerhousedao/shared",
  "@powerhousedao/powerhouse-vetra-packages",
  "@renown/sdk",
] as const;

export const CLIS_DEPENDENCIES = [
  "ph-cmd",
  "@powerhousedao/ph-cli",
  "@powerhousedao/ph-run",
];
export const APPS_DEPENDENCIES = [
  "@powerhousedao/connect",
  "@powerhousedao/switchboard",
];

export const ALL_POWERHOUSE_DEPENDENCIES = [
  ...PACKAGES_DEPENDENCIES,
  ...CLIS_DEPENDENCIES,
  ...APPS_DEPENDENCIES,
];
