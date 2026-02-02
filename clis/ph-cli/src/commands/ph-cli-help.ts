import { phCliHelpCommands } from "@powerhousedao/common/clis";
import { subcommands } from "cmd-ts";
import { getVersion } from "../get-version.js";
import { PH_CLI_DESCRIPTION } from "../utils/constants.js";

const version = getVersion();
export const phCliHelp = subcommands({
  name: "ph-cli",
  description: PH_CLI_DESCRIPTION,
  version,
  cmds: phCliHelpCommands,
});
