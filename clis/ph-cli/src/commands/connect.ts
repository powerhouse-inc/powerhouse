import { buildArgs, previewArgs, studioArgs } from "@powerhousedao/common/clis";
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
  args: studioArgs,
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
  args: buildArgs,
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
  args: previewArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log(args);
    }
    const { runConnectPreview } = await import(
      "../services/connect-preview.js"
    );
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
