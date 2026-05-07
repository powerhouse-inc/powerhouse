import { phCliHelpCommands } from "@powerhousedao/shared/clis/args";
import { subcommands } from "cmd-ts";
import { init } from "./init.js";
import { setupGlobals } from "./setup-globals.js";
import { update } from "./update.js";
import { useLocal } from "./use-local.js";
import { use } from "./use.js";

declare const CLI_VERSION: string;
// `--version` is intercepted in cli.ts before the subcommand tree is
// constructed, so cmd-ts only needs the bare version string here. The
// rich version output (with project info, package manager, etc.) is
// produced by `getPhCmdVersionInfo` along that short-circuit path.
export const ph = subcommands({
  name: "ph",
  version: CLI_VERSION,
  description:
    "The Powerhouse CLI (ph-cmd) is a command-line interface tool that provides essential commands for managing Powerhouse projects.\nThe tool and it's commands are fundamental for creating, building, and running Document Models as a builder in studio mode.",
  cmds: {
    init,
    use,
    update,
    "setup-globals": setupGlobals,
    "use-local": useLocal,
    ...phCliHelpCommands,
  },
});
