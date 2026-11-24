import { identityPasswordArgs } from "@powerhousedao/shared/clis/args";
import { command, subcommands } from "cmd-ts";

export const identityPassword = command({
  name: "password",
  description:
    "Set, change or remove the password of your pseudonym, in the home folder and in " +
    "every store it was copied into. Makes the pseudonym when there is none.",
  args: identityPasswordArgs,
  handler: async (args) => {
    const { runIdentityPassword } = await import("../services/identity.js");
    process.exitCode = await runIdentityPassword(args);
  },
});

export const identity = subcommands({
  name: "identity",
  description: "Manage your pseudonym: `password`.",
  cmds: { password: identityPassword },
});
