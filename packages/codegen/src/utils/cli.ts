import {
  DEFAULT_CONFIG,
  PowerhouseConfig,
} from "@powerhousedao/config/powerhouse";
import arg from "arg";
import enquirer from "enquirer";

const { prompt } = enquirer;

export const configSpec = {
  "--document-models": String,
  "--editors": String,
  "--interactive": Boolean,
  "--skip-format": Boolean,
  "--watch": Boolean,
  "-i": "--interactive",
  "-sf": "--skip-format",
  "-w": "--watch",
} as const;

export function parseArgs<T extends arg.Spec>(argv: string[], spec: T) {
  const args = arg(spec, {
    permissive: true,
    argv,
  });

  return args;
}

export function parseConfig(argv: string[]) {
  const config: Partial<{
    documentModelsDir?: string;
    editorsDir?: string;
    skipFormat?: boolean;
    interactive?: boolean;
    watch?: boolean;
  }> = {};
  const args = parseArgs(argv, configSpec);

  if ("--document-models" in args) {
    config.documentModelsDir = args["--document-models"];
  }

  if ("--editors" in args) {
    config.editorsDir = args["--editors"];
  }

  if ("--skip-format" in args) {
    config.skipFormat = true;
  }
  if ("--interactive" in args) {
    config.interactive = true;
  }
  if ("--watch" in args) {
    config.watch = true;
  }

  return config;
}

type DefaultDirectories = {
  documentModelsDir: string;
  editorsDir: string;
};

export async function promptDirectories(defaultDirs: DefaultDirectories) {
  return prompt<DefaultDirectories>([
    {
      type: "input",
      name: "documentModelsDir",
      message: "Where to place the Document Models?",
      initial: defaultDirs.documentModelsDir,
    },
    {
      type: "input",
      name: "editorsDir",
      message: "Where to place the Editors?",
      initial: defaultDirs.editorsDir,
    },
  ]);
}
