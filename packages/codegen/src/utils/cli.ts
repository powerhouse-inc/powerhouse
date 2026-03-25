import arg from "arg";

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
