import { phCliHelpCommands } from "@powerhousedao/common/clis";
import { subcommands } from "cmd-ts";
import { getVersionInfo } from "../get-version-info.js";
import { init } from "./init.js";
import { setupGlobals } from "./setup-globals.js";
import { update } from "./update.js";
import { useLocal } from "./use-local.js";
import { use } from "./use.js";
const versionInfo = await getVersionInfo();

export const ph = subcommands({
  name: "ph",
  version: versionInfo,
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
