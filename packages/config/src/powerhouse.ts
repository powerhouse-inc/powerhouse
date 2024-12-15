import { readFileSync, writeFileSync } from "node:fs";

export type PowerhouseConfig = {
  documentModelsDir: string;
  editorsDir: string;
  processorsDir: string;
  subgraphsDir: string;
  interactive?: boolean;
  skipFormat?: boolean;
  watch?: boolean;
};

const DEFAULT_DOCUMENT_MODELS_DIR = "./document-models";
const DEFAULT_EDITORS_DIR = "./editors";
const DEFAULT_PROCESSORS_DIR = "./processors";
const DEFAULT_SUBGRAPHS_DIR = "./subgraphs";

export const DEFAULT_CONFIG: PowerhouseConfig = {
  documentModelsDir: DEFAULT_DOCUMENT_MODELS_DIR,
  editorsDir: DEFAULT_EDITORS_DIR,
  processorsDir: DEFAULT_PROCESSORS_DIR,
  subgraphsDir: DEFAULT_SUBGRAPHS_DIR,
  skipFormat: false,
};

export function getConfig() {
  let config: PowerhouseConfig = { ...DEFAULT_CONFIG };
  try {
    const configStr = readFileSync("./powerhouse.config.json", "utf-8");
    const userConfig = JSON.parse(configStr) as PowerhouseConfig;
    config = { ...config, ...userConfig };
  } catch {
    console.warn("No powerhouse.config.json found, using defaults");
  }
  return config;
}

export function writeConfig(config: PowerhouseConfig) {
  writeFileSync("./powerhouse.config.json", JSON.stringify(config, null, 4));
}
