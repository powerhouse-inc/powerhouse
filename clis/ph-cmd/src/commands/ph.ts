import {
  getPhCmdVersionInfo,
  phCliHelpCommands,
} from "@powerhousedao/common/clis";
import { subcommands } from "cmd-ts";
import { readPackageUp } from "read-package-up";
import { init } from "./init.js";
import { setupGlobals } from "./setup-globals.js";
import { update } from "./update.js";
import { useLocal } from "./use-local.js";
import { use } from "./use.js";

declare const CLI_VERSION: string;
const phCmdVersionInfo = await getPhCmdVersionInfo(CLI_VERSION);
export const ph = subcommands({
  name: "ph",
  version: phCmdVersionInfo,
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
