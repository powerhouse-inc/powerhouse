import { defineCli } from "@powerhousedao/clint";
import { createAttachmentCommands } from "@powerhousedao/clint/powerhouse";
import { commands } from "./commands.mjs";

// A Cli that configures no reactor: the host's is the one it gets.
export const cli = defineCli({
  name: "fixture-cli",
  version: "0.0.1",
  description: "A package's Cli, run by the cli runner",
  commands: [...commands, ...createAttachmentCommands()],
  interactive: { welcome: "fixture-cli shell" },
});
