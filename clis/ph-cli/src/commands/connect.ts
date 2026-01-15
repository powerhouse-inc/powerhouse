import {
  boolean,
  command,
  flag,
  number,
  option,
  optional,
  string,
  subcommands,
} from "cmd-ts";
import {
  buildConnect,
  previewConnect,
  startConnectStudio,
} from "../services/connect.js";
import { debugArgs } from "./common-args.js";

const studioArgs = {
  port: option({
    type: optional(number),
    long: "port",
    description: "Port to run the dev server on.",
    defaultValue: () => 3000 as const,
    defaultValueIsSerializable: true,
  }),
  mode: option({
    type: optional(string),
    long: "mode",
    description: "Vite mode to use",
  }),
  configFile: option({
    type: optional(string),
    long: "config-file",
    description: "Path to the powerhouse.config.js file",
  }),
  viteConfigFile: option({
    type: optional(string),
    long: "vite-config-file",
    description: "Path to the vite config file",
  }),
  projectRoot: option({
    type: optional(string),
    long: "project-root",
    description: "The root directory of the project",
    defaultValue: () => process.cwd(),
    defaultValueIsSerializable: true,
  }),
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
  force: flag({
    type: optional(boolean),
    long: "force",
    description: "Force the optimizer to ignore the cache and re-bundle",
  }),
  ...debugArgs,
};

const buildArgs = {
  outDir: option({
    type: optional(string),
    long: "outDir",
    description: "Output directory. Defaults to '.ph/connect-build/dist/",
  }),
  base: option({
    long: "base",
    type: optional(string),
    description: "Base path for the app",
  }),
  mode: option({
    type: optional(string),
    long: "mode",
    description: "Vite mode to use",
  }),
  configFile: option({
    type: optional(string),
    long: "config-file",
    description: "Path to the powerhouse.config.js file",
  }),
  viteConfigFile: option({
    type: optional(string),
    long: "vite-config-file",
    description: "Path to the vite config file",
  }),
  projectRoot: option({
    type: optional(string),
    long: "project-root",
    description: "The root directory of the project",
    defaultValue: () => process.cwd(),
    defaultValueIsSerializable: true,
  }),
  ...debugArgs,
};

const previewArgs = {
  port: option({
    type: optional(number),
    long: "port",
    description: "Port to run the preview server on.",
    defaultValue: () => 4173 as const,
    defaultValueIsSerializable: true,
  }),
  mode: option({
    type: optional(string),
    long: "mode",
    description: "Vite mode to use",
  }),
  outDir: option({
    type: optional(string),
    long: "outDir",
    description: "Output directory. Defaults to '.ph/connect-build/dist/",
  }),
  base: option({
    long: "base",
    type: optional(string),
    description: "Base path for the app",
  }),
  configFile: option({
    type: optional(string),
    long: "config-file",
    description: "Path to the powerhouse.config.js file",
  }),
  viteConfigFile: option({
    type: optional(string),
    long: "vite-config-file",
    description: "Path to the vite config file",
  }),
  projectRoot: option({
    type: optional(string),
    long: "project-root",
    description: "The root directory of the project",
    defaultValue: () => process.cwd(),
    defaultValueIsSerializable: true,
  }),
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
  ...debugArgs,
};

export const connectArgs = {
  ...studioArgs,
  ...buildArgs,
  ...previewArgs,
};

const studio = command({
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
    await startConnectStudio(args);
    return args;
  },
});

const build = command({
  name: "build",
  description: `The Connect build command creates a production build with the project's local and
external packages included
`,
  args: buildArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log(args);
    }
    await buildConnect(args);
    return args;
  },
});

const preview = command({
  name: "preview",
  description: `The Connect preview command previews a built Connect project.
NOTE: You must run \`ph connect build\` first
`,
  args: previewArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log(args);
    }
    await previewConnect(args);
    return args;
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
