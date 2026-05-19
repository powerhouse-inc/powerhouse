import {
  connectBuildArgs,
  connectConfigArgs,
  connectPreviewArgs,
  connectStudioArgs,
} from "@powerhousedao/shared/clis/args";
import { command, subcommands } from "cmd-ts";
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
  args: connectStudioArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log(args);
    }
    const { runConnectStudio } = await import("../services/connect-studio.js");
    await runConnectStudio(args);
  },
});

export const build = command({
  name: "build",
  description: `The Connect build command creates a production build with the project's local and
external packages included
`,
  args: connectBuildArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log(args);
    }

    const { runConnectBuild } = await import("../services/connect-build.js");
    await runConnectBuild(args);
    process.exit(0);
  },
});

export const preview = command({
  name: "preview",
  description: `The Connect preview command previews a built Connect project.
NOTE: You must run \`ph connect build\` first
`,
  args: connectPreviewArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log(args);
    }
    const { runConnectPreview } =
      await import("../services/connect-preview.js");
    await runConnectPreview(args);
  },
});

export const config = command({
  name: "config",
  description: `Read or update Connect's runtime configuration (powerhouse.config.json).

Modes:
  ph connect config                       List the effective connect.* block (defaults < source).
  ph connect config <key>                 Get the value at the dotted path (e.g. connect.renown.url).
  ph connect config <key> <value>         Set the value and dual-write to source + dist.
  ph connect config --json '{"…":"…"}'   Bulk set + dual-write.

Writes go to:
  - <project>/powerhouse.config.json (source — picked up by the next build)
  - <dist-dir>/powerhouse.config.json (if it exists — the currently-served SPA picks it up on refresh)
`,
  args: connectConfigArgs,
  handler: async (args) => {
    const { runConnectConfig } = await import("../services/connect-config.js");
    await runConnectConfig(args);
  },
});

export const connect = subcommands({
  name: "connect",
  description: `Powerhouse Connect commands. Use with \`studio\`, \`build\`, \`preview\`, or \`config\`. Defaults to \`studio\` if not specified.`,
  cmds: {
    studio,
    build,
    preview,
    config,
  },
});
