import {
  tokenApproveArgs,
  tokenCreateArgs,
  tokenListArgs,
  tokenWithdrawArgs,
} from "@powerhousedao/shared/clis/args";
import { command, subcommands } from "cmd-ts";

export const tokenCreate = command({
  name: "create",
  description: `
Create a host session token: a token for a tool that signs nothing itself (curl, a script, an MCP
client), with which the host signs that tool's document changes as you, labelled. It runs the host's
OAuth device grant: with a pseudonym it approves the grant itself after asking you; with a Renown
login it opens the host's page, where you approve it with Renown. The token lives at most 30 days
and administers nothing.

Only the token goes to stdout, so a script can keep it:
  TOKEN=$(ph token create --label billing --days 7)
  curl -H "Authorization: Bearer $TOKEN" http://localhost:4001/graphql ...
  `,
  args: tokenCreateArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log(args);
    }
    const { runTokenCreate } = await import("../services/token.js");
    process.exitCode = await runTokenCreate(args);
  },
});

export const tokenApprove = command({
  name: "approve",
  description: `
Approve a code a device or tool shows (the host's consent page names this command): shows what you
would allow, asks, then signs the session's credential as your pseudonym. Approve only a code you
started yourself in the last 10 minutes.
  `,
  args: tokenApproveArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log(args);
    }
    const { runTokenApprove } = await import("../services/token.js");
    process.exitCode = await runTokenApprove(args);
  },
});

export const tokenList = command({
  name: "list",
  description: `
List the host sessions of this store (\`.ph/host-sessions\` in the data folder): label, who, how it
was granted, the client, its dates and last use. With --url, the host's own list of yours.
  `,
  args: tokenListArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log(args);
    }
    const { runTokenList } = await import("../services/token.js");
    process.exitCode = await runTokenList(args);
  },
});

export const tokenWithdraw = command({
  name: "withdraw",
  description: `
Withdraw a host session by its id (or a prefix) or label: its tokens are refused from their next
request, and the withdrawal holds after a restart. With --url, at the host, as yourself.
  `,
  args: tokenWithdrawArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log(args);
    }
    const { runTokenWithdraw } = await import("../services/token.js");
    process.exitCode = await runTokenWithdraw(args);
  },
});

export const token = subcommands({
  name: "token",
  description:
    "Host session tokens for tools that sign nothing themselves: `create`, `approve`, `list`, `withdraw`.",
  cmds: {
    create: tokenCreate,
    approve: tokenApprove,
    list: tokenList,
    withdraw: tokenWithdraw,
  },
});
