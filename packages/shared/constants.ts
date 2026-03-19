import type { PowerhouseConfig } from "./clis/types.js";

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

const DEFAULT_DOCUMENT_MODELS_DIR = "./document-models";
const DEFAULT_EDITORS_DIR = "./editors";
const DEFAULT_PROCESSORS_DIR = "./processors";
const DEFAULT_SUBGRAPHS_DIR = "./subgraphs";
const DEFAULT_IMPORT_SCRIPTS_DIR = "./scripts";
const DEFAULT_SKIP_FORMAT = false;
const DEFAULT_LOG_LEVEL = "info";

export const DEFAULT_CONFIG: PowerhouseConfig = {
  documentModelsDir: DEFAULT_DOCUMENT_MODELS_DIR,
  editorsDir: DEFAULT_EDITORS_DIR,
  processorsDir: DEFAULT_PROCESSORS_DIR,
  subgraphsDir: DEFAULT_SUBGRAPHS_DIR,
  importScriptsDir: DEFAULT_IMPORT_SCRIPTS_DIR,
  skipFormat: DEFAULT_SKIP_FORMAT,
  logLevel: DEFAULT_LOG_LEVEL,
  auth: {
    enabled: false,
    admins: [],
  },
};
