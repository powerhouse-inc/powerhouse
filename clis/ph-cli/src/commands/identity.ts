import {
  identityNewArgs,
  identityPasswordArgs,
} from "@powerhousedao/shared/clis/args";
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

export const identityNew = command({
  name: "new",
  description:
    "Make an identity for a service: a new Ethereum key, printed as `PH_IDENTITY_KEY=0x...` " +
    "with the name it signs under (Anonymous 0x1a2b...9f3c). Writes nothing unless --save " +
    "names a file, which is readable by you only and never overwritten. A process with " +
    "PH_IDENTITY_KEY set signs its own writes with that key.",
  args: identityNewArgs,
  handler: async (args) => {
    const { runIdentityNew } = await import("../services/identity.js");
    process.exitCode = runIdentityNew(args);
  },
});

export const identity = subcommands({
  name: "identity",
  description: "Your pseudonym and identities for services: `password`, `new`.",
  cmds: { password: identityPassword, new: identityNew },
});
