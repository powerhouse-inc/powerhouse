import { homedir } from "node:os";
import { join } from "node:path";
import type { Manifest } from "../document-model/types.js";
import type { PowerhouseConfig } from "./types.js";

export const SERVICE_ACTIONS = [
  "start",
  "stop",
  "status",
  "setup",
  "restart",
] as const;

export const SECONDS_IN_DAY = 24 * 60 * 60;
export const DEFAULT_EXPIRY_DAYS = 7;
export const DEFAULT_EXPIRY_SECONDS = DEFAULT_EXPIRY_DAYS * SECONDS_IN_DAY;

export const DRIVES_PRESERVE_STRATEGIES = [
  "preserve-all",
  "preserve-by-url-and-detach",
] as const;

export const LOG_LEVELS = [
  "debug",
  "info",
  "warn",
  "error",
  "verbose",
] as const;

export const DEFAULT_TIMEOUT = 300 as const;

export const DEFAULT_CONNECT_STUDIO_PORT = 3000 as const;

export const DEFAULT_VETRA_CONNECT_PORT = 3001 as const;

export const DEFAULT_CONNECT_PREVIEW_PORT = 4173 as const;

export const DEFAULT_CONNECT_OUTDIR = ".ph/connect-build/dist/" as const;

export const DEFAULT_RENOWN_URL = "https://www.renown.id" as const;

export const DEFAULT_REGISTRY_URL = "https://registry.dev.vetra.io" as const;

export const DEFAULT_SWITCHBOARD_PORT = 4001 as const;

export const DEFAULT_VETRA_DRIVE_ID = "vetra" as const;

export const MINIMUM_NODE_VERSION = "24.0.0" as const;
export const PH_BIN = "ph-cli-legacy" as const;
export const POWERHOUSE_CONFIG_FILE = "powerhouse.config.json" as const;
export const PH_GLOBAL_DIR_NAME = ".ph" as const;
// Keep PH_GLOBAL_PROJECT_NAME for backwards compatibility
export const PH_GLOBAL_PROJECT_NAME = PH_GLOBAL_DIR_NAME;

export const HOME_DIR = homedir();

export const POWERHOUSE_GLOBAL_DIR = join(HOME_DIR, PH_GLOBAL_DIR_NAME);

// Workspace packages that go in peerDependencies of every generated project.
export const VERSIONED_PEER_DEPENDENCIES = [
  "document-model",
  "@powerhousedao/reactor-browser",
];

type PeerSpec = { peer: string; dev: string };

// External peerDependencies of every generated project.
// `peer` is the consumer-facing range; `dev` is the exact build-tested pin.
export const PEER_EXTERNAL_DEPENDENCIES = {
  react: { peer: "^19", dev: "19.2.3" },
  "react-dom": { peer: "^19", dev: "19.2.3" },
  zod: { peer: "^4", dev: "4.3.6" },
} as const satisfies Record<string, PeerSpec>;

// Per-feature deps added dynamically by codegen when required.
export const FEATURE_DEPENDENCIES = {
  subgraph: {
    peerVersioned: ["@powerhousedao/reactor-api"],
    peerExternal: {
      graphql: { peer: "^16", dev: "16.12.0" },
      "graphql-tag": { peer: "^2", dev: "2.12.6" },
    },
  },
  analyticsProcessor: {
    peerVersioned: ["@powerhousedao/analytics-engine-core"],
    peerExternal: {},
  },
} as const satisfies Record<
  string,
  { peerVersioned: readonly string[]; peerExternal: Record<string, PeerSpec> }
>;

export const VERSIONED_DEPENDENCIES = [
  ...VERSIONED_PEER_DEPENDENCIES,
  ...FEATURE_DEPENDENCIES.subgraph.peerVersioned,
  ...FEATURE_DEPENDENCIES.analyticsProcessor.peerVersioned,
];

export const VERSIONED_DEV_DEPENDENCIES = [
  "@powerhousedao/ph-cli",
  "@powerhousedao/reactor",
  "@powerhousedao/shared",
  "@powerhousedao/connect",
  "@powerhousedao/design-system",
];

export const packageJsonExports = {
  ".": {
    types: "./dist/types/index.d.ts",
    browser: "./dist/browser/index.js",
    node: "./dist/node/index.mjs",
  },
  "./document-models": {
    types: "./dist/types/document-models/index.d.ts",
    browser: "./dist/browser/document-models/index.js",
    node: "./dist/node/document-models/index.mjs",
  },
  "./document-models/*": {
    types: "./dist/types/document-models/*/index.d.ts",
    browser: "./dist/browser/document-models/*/index.js",
    node: "./dist/node/document-models/*/index.mjs",
  },
  "./editors": {
    types: "./dist/types/editors/index.d.ts",
    browser: "./dist/browser/editors/index.js",
    node: "./dist/node/editors/index.mjs",
  },
  "./editors/*": {
    types: "./dist/types/editors/*/editor.d.ts",
    browser: "./dist/browser/editors/*/editor.js",
    node: "./dist/node/editors/*/editor.mjs",
  },
  "./subgraphs": {
    types: "./dist/types/subgraphs/index.d.ts",
    browser: "./dist/browser/subgraphs/index.js",
    node: "./dist/node/subgraphs/index.mjs",
  },
  "./processors": {
    types: "./dist/types/processors/index.d.ts",
    browser: "./dist/browser/processors/index.js",
    node: "./dist/node/processors/index.mjs",
  },
  "./manifest": "./dist/powerhouse.manifest.json",
  "./style.css": "./dist/style.css",
} as const;

export const packageScripts = {
  "test:watch": "vitest",
  lint: "eslint --config eslint.config.js --cache",
  "lint:fix": "npm run lint -- --fix",
  tsc: "tsc",
  "tsc:watch": "tsc --watch",
  generate: "ph-cli generate",
  connect: "ph-cli connect",
  build: "ph-cli build",
  reactor: "ph-cli reactor",
  service: "ph-cli service",
  vetra: "ph-cli vetra",
  "service-startup":
    "bash ./node_modules/@powerhousedao/ph-cli/dist/scripts/service-startup.sh",
  "service-unstartup":
    "bash ./node_modules/@powerhousedao/ph-cli/dist/scripts/service-unstartup.sh",
} as const;

export const externalDependencies = {} as const;

export const externalDevDependencies = {
  "@electric-sql/pglite": "0.3.15",
  "@electric-sql/pglite-tools": "0.2.20",
  "@eslint/js": "^9.38.0",
  "@powerhousedao/document-engineering": "1.40.3",
  "@tailwindcss/cli": "^4.1.18",
  "@tailwindcss/vite": "^4.1.18",
  "@types/node": "^24.9.2",
  "@types/react": "^19.2.3",
  "@types/react-dom": "^19.2.3",
  "@vitejs/plugin-react": "^6.0.1",
  "@vitest/coverage-v8": "4.1.1",
  eslint: "^9.38.0",
  "eslint-config-prettier": "^10.1.8",
  "eslint-plugin-prettier": "^5.5.4",
  "eslint-plugin-react": "^7.37.5",
  "eslint-plugin-react-hooks": "^7.0.1",
  globals: "^16.4.0",
  tailwindcss: "^4.1.16",
  typescript: "^5.9.3",
  "typescript-eslint": "^8.46.2",
  vite: "^8.0.8",
  "vite-tsconfig-paths": "6.1.1",
  vitest: "4.1.1",
} as const;

export const defaultManifest: Manifest = {
  name: "",
  description: "",
  category: "",
  publisher: {
    name: "",
    url: "",
  },
  documentModels: [],
  editors: [],
  apps: [],
  subgraphs: [],
  processors: [],
};

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
