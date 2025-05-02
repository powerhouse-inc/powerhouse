import { readFileSync, writeFileSync } from "node:fs";

export const LogLevels = {
  verbose: 1,
  debug: 2,
  info: 3,
  warn: 4,
  error: 5,
  silent: 6,
} as const;

export type LogLevel = keyof typeof LogLevels;

export function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === "string" && value in LogLevels;
}
export type PHPackageProvider = "npm" | "github" | "local";

export type PowerhousePackage = {
  packageName: string;
  version?: string;
  provider?: PHPackageProvider;
  url?: string;
};

export type PowerhouseConfig = {
  documentModelsDir: string;
  editorsDir: string;
  processorsDir: string;
  subgraphsDir: string;
  importScriptsDir: string;
  interactive?: boolean;
  skipFormat: boolean;
  watch?: boolean;
  reactor?: {
    port?: number;
    https?:
      | undefined
      | boolean
      | {
          keyPath: string;
          certPath: string;
        };
    storage?: {
      type: "filesystem" | "memory" | "postgres" | "browser";
      filesystemPath?: string;
      postgresUrl?: string;
    };
  };
  studio?: {
    port?: number;
    host?: string;
    https: boolean;
    openBrowser?: boolean;
  };
  packages?: PowerhousePackage[];
  logLevel: LogLevel;
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
};

export function getConfig(path = "./powerhouse.config.json") {
  let config: PowerhouseConfig = { ...DEFAULT_CONFIG };
  try {
    const configStr = readFileSync(path, "utf-8");
    const userConfig = JSON.parse(configStr) as PowerhouseConfig;
    config = { ...config, ...userConfig };
  } catch {
    console.warn("No powerhouse.config.json found, using defaults");
  }

  return config;
}

export function writeConfig(
  config: PowerhouseConfig,
  path = "./powerhouse.config.json",
) {
  writeFileSync(path, JSON.stringify(config, null, 4));
}
