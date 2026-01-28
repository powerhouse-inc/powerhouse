import { loginArgs } from "@powerhousedao/common/clis";
import { command } from "cmd-ts";
import {
  clearCredentials,
  generateSessionId,
  getRenown,
  isAuthenticated,
  loadCredentials,
  saveCredentials,
  type StoredCredentials,
} from "../services/auth.js";

export const login = command({
  name: "login",
  description: `
The login command authenticates you with Renown using your Ethereum wallet. This enables
the CLI to act on behalf of your Ethereum identity for authenticated operations.

This command:
1. Generates or loads a cryptographic identity (DID) for the CLI
2. Opens your browser to the Renown authentication page
3. You authorize the CLI's DID to act on behalf of your Ethereum address
4. Stores the credentials locally in ~/.ph/auth.json
  `,
  args: loginArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log(args);
    }

    if (args.showDid) {
      await showDid();
      return;
    }

    // Handle status check
    if (args.status) {
      await showStatus();
      return;
    }

    // Handle logout
    if (args.logout) {
      handleLogout();
      return;
    }

    const renownUrl = args.renownUrl;
    const timeoutMs = args.timeout ? args.timeout * 1000 : DEFAULT_TIMEOUT_MS;

    // Check if already authenticated
    if (isAuthenticated()) {
      const creds = loadCredentials();
      console.log(`Already authenticated as ${creds?.address}`);
      console.log('Use "ph login --logout" to sign out first.');
      return;
    }

    // Get the CLI's DID from ConnectCrypto
    console.log("Initializing cryptographic identity...");
    const renown = await getRenown();
    console.log(`CLI DID: ${renown.did}`);

    // Generate session ID
    const sessionId = generateSessionId();

    // Build the login URL with connect DID
    const loginUrl = new URL(`${renownUrl}/console`);
    loginUrl.searchParams.set("session", sessionId);
    loginUrl.searchParams.set("connect", renown.did);

    console.log("Opening browser for authentication...");
    console.log(`Session ID: ${sessionId.slice(0, 8)}...`);
    console.log();

    // Open browser
    await openBrowser(loginUrl.toString());

    console.log("Waiting for authentication in browser");
    console.log(`(timeout in ${timeoutMs / 1000} seconds)`);
    console.log();
    console.log(
      "Please connect your wallet and authorize this CLI to act on your behalf.",
    );
    console.log();
    process.stdout.write("Waiting");

    // Poll for session completion
    const result = await pollSession(renownUrl, sessionId, timeoutMs);

    console.log(); // New line after dots

    if (!result) {
      throw new Error(
        "\nAuthentication timed out. \nPlease try again with: ph login",
      );
    }

    // Save credentials
    const credentials: StoredCredentials = {
      address: result.address!,
      chainId: result.chainId!,
      userDid: result.did!,
      appDid: renown.did,
      credentialId: result.credentialId!,
      userDocumentId: result.userDocumentId,
      authenticatedAt: new Date().toISOString(),
      renownUrl,
    };

    saveCredentials(credentials);

    console.log();
    console.log("Successfully authenticated!");
    console.log(`  ETH Address: ${credentials.address}`);
    console.log(`  User DID: ${credentials.userDid}`);
    console.log(`  CLI DID: ${credentials.appDid}`);
    console.log();
    console.log("The CLI can now act on behalf of your Ethereum identity.");
  },
});

interface SessionResponse {
  sessionId: string;
  status: "pending" | "ready";
  address?: string;
  chainId?: number;
  did?: string;
  credentialId?: string;
  userDocumentId?: string;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const POLL_INTERVAL_MS = 2000; // 2 seconds

/**
 * Open a URL in the default browser
 */
async function openBrowser(url: string): Promise<void> {
  const { exec } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execAsync = promisify(exec);

  const platform = process.platform;

  try {
    if (platform === "darwin") {
      await execAsync(`open "${url}"`);
    } else if (platform === "win32") {
      await execAsync(`start "" "${url}"`);
    } else {
      // Linux and others
      await execAsync(`xdg-open "${url}"`);
    }
  } catch (error) {
    console.error("Failed to open browser automatically.");
    console.log(`Please open this URL manually: ${url}`);
  }
}

/**
 * Poll the session endpoint until ready or timeout
 */
async function pollSession(
  renownUrl: string,
  sessionId: string,
  timeoutMs: number,
): Promise<SessionResponse | null> {
  const startTime = Date.now();
  const sessionUrl = `${renownUrl}/api/console/session/${sessionId}`;

  while (Date.now() - startTime < timeoutMs) {
    try {
      const response = await fetch(sessionUrl);

      if (!response.ok) {
        console.error(`Session check failed: ${response.status}`);
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      const data = (await response.json()) as SessionResponse;

      if (data.status === "ready") {
        return data;
      }

      // Still pending, wait and try again
      process.stdout.write(".");
      await sleep(POLL_INTERVAL_MS);
    } catch (error) {
      // Network error, wait and retry
      await sleep(POLL_INTERVAL_MS);
    }
  }

  return null; // Timeout reached
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Show current authentication status
 */
async function showStatus(): Promise<void> {
  const creds = loadCredentials();

  // Always show the CLI's DID
  try {
    const renown = await getRenown();
    console.log(`CLI DID: ${renown.did}`);
    console.log();
  } catch (e) {
    console.log("CLI DID: (not yet initialized)");
    console.log();
  }

  if (!creds || !creds.credentialId) {
    console.log("Not authenticated with an Ethereum address.");
    console.log('Run "ph login" to authenticate.');
    return;
  }

  console.log("Authenticated");
  console.log(`  ETH Address: ${creds.address}`);
  console.log(`  User DID: ${creds.userDid}`);
  console.log(`  Chain ID: ${creds.chainId}`);
  console.log(`  Authenticated at: ${creds.authenticatedAt}`);
  console.log(`  Renown URL: ${creds.renownUrl}`);

  process.exit(0);
}

/**
 * Show just the CLI DID
 */
async function showDid(): Promise<void> {
  try {
    const renown = await getRenown();
    console.log(renown.did);
  } catch (e) {
    console.error("Failed to get DID:");
    throw e;
  }
}

/**
 * Logout and clear credentials
 */
function handleLogout(): void {
  if (!isAuthenticated()) {
    console.log("Not currently authenticated.");
    return;
  }

  const success = clearCredentials();
  if (success) {
    console.log("Successfully logged out.");
  } else {
    console.error("Failed to clear credentials.");
  }
}
