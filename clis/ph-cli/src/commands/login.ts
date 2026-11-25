import { loginArgs } from "@powerhousedao/shared/clis/args";
import { command } from "cmd-ts";

export const login = command({
  name: "login",
  description: `
The login command authenticates you with Renown using your Ethereum wallet. This enables
the CLI to act on behalf of your Ethereum identity for authenticated operations.

This command:
1. Generates or loads a cryptographic identity (DID) for the CLI
2. Opens your browser to the Renown authentication page
3. You authorize the CLI's DID to act on behalf of your Ethereum address
4. Stores the login in your home folder (~/.ph/identities/renown), for every project
  `,
  args: loginArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log(args);
    }

    if (args.status) {
      const { runWhoami } = await import("../services/identity.js");
      process.exitCode = await runWhoami(args);
      return;
    }

    if (args.logout) {
      const { runLogout } = await import("../services/identity.js");
      process.exitCode = await runLogout(args);
      return;
    }

    const { getRenown } = await import("../services/auth.js");
    const renown = await getRenown(args.renownUrl);

    if (args.showDid) {
      console.log(renown.did);
      process.exit(0);
    }

    const { identityDataDir } =
      await import("@powerhousedao/shared/clis/identity");
    const { projectLoginNotice } = await import("../services/identity.js");
    const notice = projectLoginNotice(identityDataDir());
    if (notice) console.warn(notice);

    const { browserLogin } = await import("@renown/sdk/node");

    console.debug("Initializing cryptographic identity...");
    console.log(`CLI DID: ${renown.did}`);

    try {
      const timeoutMs = args.timeout ? args.timeout * 1000 : undefined;

      const result = await browserLogin(renown, {
        renownUrl: args.renownUrl,
        timeoutMs,
        onLoginUrl: (url, sessionId) => {
          console.log("Opening browser for authentication...");
          console.log(`Session ID: ${sessionId.slice(0, 8)}...`);
          console.log(`Login URL: ${url}`);
          console.log();
          console.log("Waiting for authentication in browser");
          console.log(`(timeout in ${(timeoutMs ?? 300_000) / 1000} seconds)`);
          console.log();
          console.log(
            "Please connect your wallet and authorize this CLI to act on your behalf.",
          );
          console.log();
          process.stdout.write("Waiting");
        },
        onPollTick: () => process.stdout.write("."),
        onBrowserOpenFailed: (url) => {
          console.error("Failed to open browser automatically.");
          console.log(`Please open this URL manually: ${url}`);
        },
      });

      console.log(); // New line after dots
      console.log();
      console.log("Successfully authenticated!");
      console.log(`  ETH Address: ${result.user.address}`);
      console.log(`  User DID: ${result.user.did}`);
      console.log(`  CLI DID: ${result.cliDid}`);
      console.log();
      console.log("The CLI can now act on behalf of your Ethereum identity.");
    } catch (error) {
      console.log(); // New line after dots
      throw error;
    }

    process.exit(0);
  },
});
