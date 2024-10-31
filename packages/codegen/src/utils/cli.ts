import arg from "arg";
import enquirer from "enquirer";
import { readFileSync, writeFileSync } from "node:fs";

const { prompt } = enquirer;

export type PowerhouseConfig = {
  documentModelsDir: string;
  editorsDir: string;
  interactive?: boolean;
  format?: boolean;
  watch?: boolean;
};

const DEFAULT_DOCUMENT_MODELS_DIR = "./document-models";
const DEFAULT_EDITORS_DIR = "./editors";

export const DEFAULT_CONFIG: PowerhouseConfig = {
  documentModelsDir: DEFAULT_DOCUMENT_MODELS_DIR,
  editorsDir: DEFAULT_EDITORS_DIR,
};

export const configSpec = {
  "--document-models": String,
  "--editors": String,
  "--interactive": Boolean,
  "--format": Boolean,
  "--watch": Boolean,
  "-i": "--interactive",
  "-f": "--format",
  "-w": "--watch",
} as const;

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

export function parseArgs<T extends arg.Spec>(argv: string[], spec: T) {
  const args = arg(spec, {
    permissive: true,
    argv,
  });

  return args;
}

export function parseConfig(argv: string[]) {
  const config: Partial<PowerhouseConfig> = {};
  const args = parseArgs(argv, configSpec);

  if ("--document-models" in args) {
    config.documentModelsDir = args["--document-models"];
  }

  if ("--editors" in args) {
    config.editorsDir = args["--editors"];
  }

  if ("--format" in args) {
    config.format = true;
  }
  if ("--interactive" in args) {
    config.interactive = true;
  }
  if ("--watch" in args) {
    config.watch = true;
  }

  return config;
}

export async function promptDirectories(
  config: PowerhouseConfig = DEFAULT_CONFIG,
) {
  return prompt<Pick<PowerhouseConfig, "documentModelsDir" | "editorsDir">>([
    {
      type: "input",
      name: "documentModelsDir",
      message: "Where to place the Document Models?",
      initial: config.documentModelsDir,
    },
    {
      type: "input",
      name: "editorsDir",
      message: "Where to place the Editors?",
      initial: config.editorsDir,
    },
  ]);
}
