export const PACKAGES_DEPENDENCIES = [
  "@powerhousedao/builder-tools",
  "@powerhousedao/codegen",
  "@powerhousedao/common",
  "@powerhousedao/config",
  "@powerhousedao/design-system",
  "document-drive",
  "document-model",
  "@powerhousedao/reactor",
  "@powerhousedao/reactor-api",
  "@powerhousedao/reactor-browser",
  "@powerhousedao/reactor-local",
  "@powerhousedao/reactor-mcp",
  "@powerhousedao/switchboard-gui",
  "@powerhousedao/vetra",
  "@powerhousedao/analytics-engine-core",
  "@powerhousedao/analytics-engine-knex",
  "@powerhousedao/analytics-engine-pg",
  "@powerhousedao/analytics-engine-browser",
  "@powerhousedao/analytics-engine-graphql",
  "@powerhousedao/shared",
  "@powerhousedao/powerhouse-vetra-packages",
  "@powerhousedao/analytics-engine-core",
  "@powerhousedao/analytics-engine-graphql",
  "@powerhousedao/analytics-engine-knex",
  "@powerhousedao/analytics-engine-pg",
  "@powerhousedao/analytics-engine-browser",
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
