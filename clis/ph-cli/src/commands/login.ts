import { loginArgs } from "@powerhousedao/shared/clis";
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
4. Stores the credentials locally in .ph/.renown.json
  `,
  args: loginArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log(args);
    }

    const { getRenown } = await import("../services/auth.js");
    const renown = await getRenown();

    if (args.showDid) {
      console.log(renown.did);
      process.exit(0);
    }

    if (args.status) {
      const { getAuthStatus } = await import("@renown/sdk/node");
      const status = getAuthStatus(renown);
      if (!status.authenticated || !status.address) {
        console.log("Not authenticated with an Ethereum address.");
        console.log('Run "ph login" to authenticate.');
      } else {
        console.log("Authenticated");
        console.log(`  ETH Address: ${status.address}`);
        console.log(`  User DID: ${status.userDid}`);
        console.log(`  Chain ID: ${status.chainId}`);
        console.log(`  CLI DID: ${status.cliDid}`);
        console.log(
          `  Authenticated at: ${status.authenticatedAt?.toLocaleString()}`,
        );
        console.log(`  Renown URL: ${status.baseUrl}`);
      }
      process.exit(0);
    }

    if (args.logout) {
      await handleLogout();
      process.exit(0);
    }

    const { browserLogin } = await import("@renown/sdk/node");

    console.debug("Initializing cryptographic identity...");
    console.log(`CLI DID: ${renown.did}`);

    try {
      const timeoutMs = args.timeout ? args.timeout * 1000 : undefined;

      const result = await browserLogin(renown, {
        renownUrl: args.renownUrl,
        timeoutMs,
        onLoginUrl: (_url, sessionId) => {
          console.log("Opening browser for authentication...");
          console.log(`Session ID: ${sessionId.slice(0, 8)}...`);
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
      if (error instanceof Error) {
        throw new Error(`\n${error.message}\nPlease try again with: ph login`);
      }
      throw error;
    }

    process.exit(0);
  },
});

export async function handleLogout() {
  const { getRenown } = await import("../services/auth.js");
  const renown = await getRenown();
  if (!renown.user) {
    console.log("Not currently authenticated.");
    return;
  }

  try {
    await renown.logout();
    console.log("Successfully logged out.");
  } catch (error) {
    console.error("Failed to clear credentials.");
    console.debug(error);
  }
}
