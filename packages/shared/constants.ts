// Every package published from the monorepo that `ph update` / `ph use` keep in lockstep.
export const PACKAGES_DEPENDENCIES = [
  "@powerhousedao/builder-tools",
  "@powerhousedao/codegen",
  "@powerhousedao/common",
  "@powerhousedao/config",
  "@powerhousedao/design-system",
  "document-drive",
  "document-model",
  "@powerhousedao/opentelemetry-instrumentation-reactor",
  "@powerhousedao/pieces-framework",
  "@powerhousedao/reactor",
  "@powerhousedao/reactor-api",
  "@powerhousedao/reactor-attachments",
  "@powerhousedao/reactor-browser",
  "@powerhousedao/reactor-drive",
  "@powerhousedao/reactor-group",
  "@powerhousedao/reactor-hypercore",
  "@powerhousedao/reactor-mcp",
  "@powerhousedao/reactor-privacy",
  "@powerhousedao/reactor-workflow",
  "@powerhousedao/registry",
  "@powerhousedao/switchboard-gui",
  "@powerhousedao/vetra",
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

export const CLIS_DEPENDENCIES = ["ph-cmd", "@powerhousedao/ph-cli"];
export const APPS_DEPENDENCIES = [
  "@powerhousedao/connect",
  "@powerhousedao/switchboard",
];

export const ALL_POWERHOUSE_DEPENDENCIES = [
  ...PACKAGES_DEPENDENCIES,
  ...CLIS_DEPENDENCIES,
  ...APPS_DEPENDENCIES,
];
