import { readFileSync, writeFileSync } from "node:fs";

export type PowerhousePackage = {
  packageName: string;
};

export type PowerhouseConfig = {
  documentModelsDir: string;
  editorsDir: string;
  processorsDir: string;
  subgraphsDir: string;
  importScriptsDir: string;
  interactive?: boolean;
  skipFormat?: boolean;
  watch?: boolean;
  switchboard?: {
    port?: number;
  };
  studio?: {
    port?: number;
    host?: string;
    https: boolean;
    openBrowser?: boolean;
  };
  packages?: PowerhousePackage[];
};

const DEFAULT_DOCUMENT_MODELS_DIR = "./document-models";
const DEFAULT_EDITORS_DIR = "./editors";
const DEFAULT_PROCESSORS_DIR = "./processors";
const DEFAULT_SUBGRAPHS_DIR = "./subgraphs";
const DEFAULT_IMPORT_SCRIPTS_DIR = "./scripts";

export const DEFAULT_CONFIG: PowerhouseConfig = {
  documentModelsDir: DEFAULT_DOCUMENT_MODELS_DIR,
  editorsDir: DEFAULT_EDITORS_DIR,
  processorsDir: DEFAULT_PROCESSORS_DIR,
  subgraphsDir: DEFAULT_SUBGRAPHS_DIR,
  importScriptsDir: DEFAULT_IMPORT_SCRIPTS_DIR,
  skipFormat: false,
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
