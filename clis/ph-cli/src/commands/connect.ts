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
external packages included.

Runtime-config overrides (all combinable — last wins on collision):
  ph connect build                                    Build with the current source config.
  ph connect build <key> <value>                      Build with a positional override applied (e.g. ph connect build connect.renown.url https://renown.staging).
  ph connect build --<field> <value>                  Build with a per-field flag override (e.g. --renown-url https://renown.staging).
  ph connect build --json '{"…":"…"}'                Build with a bulk override.

Build has no read mode; passing only <key> without <value> errors out (use \`ph connect config <key>\` to read).
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

Modes (mutually exclusive — positional, --get, --json, and field flags cannot be combined):
  ph connect config                       List the effective connect.* block (defaults < source).
  ph connect config <key>                 Get the value at the dotted path (e.g. ph connect config connect.renown.url).
  ph connect config --get <dotted.path>   Same as positional <key> (kept for backward compat).
  ph connect config <key> <value>         Set a single field and dual-write to source + dist (positional).
  ph connect config --<field> <value>     Set a single field via per-field flag (e.g. --renown-url https://renown.id).
  ph connect config --json '{"…":"…"}'   Bulk-set multiple fields and dual-write.

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
