import {
  credentialsListArgs,
  credentialsWithdrawArgs,
} from "@powerhousedao/shared/clis/args";
import { command, subcommands } from "cmd-ts";

export const credentialsList = command({
  name: "list",
  description: `
List the credentials this store's host accepts by its own record (\`.ph/credentials\` in the
data folder): who, the session's label, who wrote it, its expiry and whether it verifies.
  `,
  args: credentialsListArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log(args);
    }
    const { runCredentialsList } = await import("../services/credentials.js");
    process.exitCode = await runCredentialsList(args);
  },
});

export const credentialsWithdraw = command({
  name: "withdraw",
  description: `
Withdraw credential records by id prefix, address or label. A running host refuses a withdrawn
credential from its next request, and the withdrawal holds after a restart.
  `,
  args: credentialsWithdrawArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log(args);
    }
    const { runCredentialsWithdraw } =
      await import("../services/credentials.js");
    process.exitCode = runCredentialsWithdraw(args);
  },
});

export const credentials = subcommands({
  name: "credentials",
  description: "The credentials this store's host accepts: `list`, `withdraw`.",
  cmds: { list: credentialsList, withdraw: credentialsWithdraw },
});
