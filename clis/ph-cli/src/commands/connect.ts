import { DEFAULT_CONNECT_OUTDIR } from "@powerhousedao/builder-tools";
import {
  boolean,
  command,
  flag,
  number,
  oneOf,
  option,
  optional,
  string,
  subcommands,
} from "cmd-ts";
import {
  runConnectBuild,
  runConnectPreview,
  runConnectStudio,
} from "../services/connect.js";
import {
  debugArgs,
  disableLocalPackages,
  localPackage,
  packages,
} from "./common-args.js";

const drivesPreserveStrategies = [
  "preserve-all",
  "preserve-by-url-and-detach",
] as const;

const logLevels = ["debug", "info", "warn", "error"] as const;

export const defaultDrivesUrl = option({
  type: optional(string),
  long: "default-drives-url",
  description: "The default drives url to use in connect",
  env: "PH_CONNECT_DEFAULT_DRIVES_URL" as const,
});

export const logLevel = option({
  type: oneOf(logLevels),
  long: "log-level",
  description: "Log level for the application",
  defaultValue: () => "info" as const,
  defaultValueIsSerializable: true,
  env: "PH_CONNECT_LOG_LEVEL" as const,
});

export const connectBasePath = option({
  long: "base",
  type: string,
  description: "Base path for the app",
  env: "PH_CONNECT_BASE_PATH" as const,
  defaultValue: () => process.cwd(),
  defaultValueIsSerializable: true,
});

export const drivesPreserveStrategy = option({
  type: oneOf(drivesPreserveStrategies),
  long: "The preservation strategy to use on default drives",
  defaultValue: () => "preserve-by-url-and-detach" as const,
  defaultValueIsSerializable: true,
  env: "PH_CONNECT_DRIVES_PRESERVE_STRATEGY" as const,
});

export const forceOptimizeDeps = flag({
  type: optional(boolean),
  long: "force",
});

export const commonArgs = {
  connectBasePath,
  logLevel,
  packages,
  localPackage,
  disableLocalPackages,
  defaultDrivesUrl,
  drivesPreserveStrategy,
  forceOptimizeDeps,
  ...debugArgs,
};

export const commonServerArgs = {
  host: flag({
    type: optional(boolean),
    long: "host",
    description: "Expose the server to the network",
  }),
  open: flag({
    type: optional(boolean),
    long: "open",
    description: "Open browser on startup",
  }),
  cors: flag({
    type: optional(boolean),
    long: "cors",
    description: "Enable CORS",
  }),
  strictPort: flag({
    type: optional(boolean),
    long: "strictPort",
    description: "Exit if specified port is already in use",
  }),
  printUrls: flag({
    type: boolean,
    long: "print-urls",
    description: "Print server urls",
    defaultValue: () => true,
    defaultValueIsSerializable: true,
  }),
  bindCLIShortcuts: flag({
    type: boolean,
    long: "bind-cli-shortcuts",
    description: "Bind CLI shortcuts",
    defaultValue: () => true,
    defaultValueIsSerializable: true,
  }),
  watchTimeout: option({
    type: number,
    long: "watch-timeout",
    description: "Amount of time to wait before a file is considered changed",
    defaultValue: () => 300 as const,
    defaultValueIsSerializable: true,
    env: "PH_WATCH_TIMEOUT" as const,
  }),
};

const studioArgs = {
  port: option({
    type: number,
    long: "port",
    description: "Port to run the dev server on.",
    defaultValue: () => 3000 as const,
    defaultValueIsSerializable: true,
  }),
  ...commonArgs,
  ...commonServerArgs,
};

const buildArgs = {
  outDir: option({
    type: optional(string),
    long: "outDir",
    description: "Output directory",
    defaultValue: () => DEFAULT_CONNECT_OUTDIR,
    defaultValueIsSerializable: true,
  }),
  ...commonArgs,
};

const previewArgs = {
  port: option({
    type: number,
    long: "port",
    description: "Port to run the preview server on.",
    defaultValue: () => 4173 as const,
    defaultValueIsSerializable: true,
  }),
  outDir: option({
    type: optional(string),
    long: "outDir",
    description: "Output directory",
    defaultValue: () => DEFAULT_CONNECT_OUTDIR,
    defaultValueIsSerializable: true,
  }),
  ...commonArgs,
  ...commonServerArgs,
};

export const connectArgs = {
  ...studioArgs,
  ...buildArgs,
  ...previewArgs,
};

export const studio = command({
  name: "studio",
  description: `The studio command starts the Connect Studio, a development environment for building
and testing Powerhouse applications. It provides a visual interface for working with
your project.

This command:
1. Starts a local Connect Studio server
2. Provides a web interface for development
3. Allows you to interact with your project components
4. Supports various configuration options for customization
`,
  args: studioArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log(args);
    }
    await runConnectStudio(args);
  },
});

export const build = command({
  name: "build",
  description: `The Connect build command creates a production build with the project's local and
external packages included
`,
  args: buildArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log(args);
    }
    await runConnectBuild(args);
  },
});

export const preview = command({
  name: "preview",
  description: `The Connect preview command previews a built Connect project.
NOTE: You must run \`ph connect build\` first
`,
  args: previewArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log(args);
    }
    await runConnectPreview(args);
  },
});

export const connect = subcommands({
  name: "connect",
  description: `Powerhouse Connect commands. Use with \`studio\`, \`build\` or \`preview\`. Defaults to \`studio\` if not specified.`,
  cmds: {
    studio,
    build,
    preview,
  },
});
