import { connectConfigArgs } from "@powerhousedao/shared/clis/args";
import { command, subcommands } from "cmd-ts";

export const config = command({
  name: "config",
  description: `Read or update Connect's runtime configuration (powerhouse.config.json).

Modes (mutually exclusive — positional, --get, --json, and field flags cannot be combined):
  ph connect config                       List the effective connect.* block (defaults < source).
  ph connect config <key>                 Get the value at the dotted path (e.g. ph connect config connect.renown.url).
  ph connect config --get <dotted.path>   Same as positional <key> (kept for backward compat).
  ph connect config <key> <value>         Set a single field and dual-write to source + dist (positional).
  ph connect config --<field> <value>     Set a single field via per-field flag (e.g. --renown-url https://renown.id).
  ph connect config --json '{"renown":{"url":"…"}}'
                                          Bulk-set multiple fields and dual-write. The payload is the connect.*
                                          block without the "connect" wrapper; unknown keys are rejected.

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

// `ph connect`, `ph connect studio`, `ph connect build` and
// `ph connect preview` never reach this command: they are sugar for
// `ph run connect dev|build|serve` (utils/run-sugar.ts).
export const connect = subcommands({
  name: "connect",
  description: `Powerhouse Connect. \`ph connect\` runs the project's connect host: it is \`ph run connect dev\`, as is \`ph connect studio\`; \`ph connect build\` is \`ph run connect build\` and \`ph connect preview\` is \`ph run connect serve\`. \`ph connect config\` reads and writes Connect's runtime configuration.`,
  cmds: {
    config,
  },
});
