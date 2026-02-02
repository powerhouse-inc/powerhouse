import { subcommands } from "cmd-ts";
import { getVersion } from "../get-version.js";
import { PH_CLI_DESCRIPTION } from "../utils/constants.js";
import { phCliCommands } from "./ph-cli-commands.js";

const version = getVersion();
export const phCli = subcommands({
  name: "ph-cli",
  description: PH_CLI_DESCRIPTION,
  version,
  cmds: phCliCommands,
});
