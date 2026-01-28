import { DEFAULT_RENOWN_URL } from "@renown/sdk/node";
import type { Command } from "commander";
import { loginHelp } from "../../help.js";
import type { CommandActionType } from "../../types.js";
import { setCustomHelp } from "../../utils.js";

export type LoginOptions = {
  renownUrl?: string;
  timeout?: string;
  logout?: boolean;
  status?: boolean;
  showDid?: boolean;
};

interface PendingSessionResponse {
  sessionId: string;
  status: "pending";
}

interface ReadySessionResponse {
  sessionId: string;
  status: "ready";
  address: string;
  chainId: number;
  did: string;
  credentialId: string;
  userDocumentId: string;
}

type SessionResponse = PendingSessionResponse | ReadySessionResponse;

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
): Promise<ReadySessionResponse | null> {
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
  const { getRenown } = await import("../../services/auth.js");
  const renown = await getRenown();
  const user = renown.user;
  if (!user || !user.credential) {
    console.log("Not authenticated with an Ethereum address.");
    console.log('Run "ph login" to authenticate.');
    return;
  }

  const issuanceDate = new Date(user.credential.issuanceDate);
  console.log("Authenticated");
  console.log(`  ETH Address: ${user.address}`);
  console.log(`  User DID: ${user.did}`);
  console.log(`  Chain ID: ${user.chainId}`);
  console.log(`  CLI DID: ${renown.did}`);
  console.log(`  Authenticated at: ${issuanceDate.toLocaleString()}`);
  console.log(`  Renown URL: ${renown.baseUrl}`);

  process.exit(0);
}

/**
 * Show just the CLI DID
 */
async function showDid(): Promise<void> {
  const { getRenown } = await import("../../services/auth.js");
  try {
    const renown = await getRenown();
    console.log(renown.did);
  } catch (e) {
    console.error("Failed to get DID:", e);
    process.exit(1);
  }
}

/**
 * Logout and clear credentials
 */
async function handleLogout() {
  const { getRenown } = await import("../../services/auth.js");
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

export const login: CommandActionType<[LoginOptions]> = async (options) => {
  // Handle showing just the DID
  if (options.showDid) {
    await showDid();
    return;
  }

  // Handle status check
  if (options.status) {
    await showStatus();
    return;
  }

  // Handle logout
  if (options.logout) {
    await handleLogout();
    return;
  }

  const renownUrl = options.renownUrl || DEFAULT_RENOWN_URL;
  const timeoutMs = options.timeout
    ? parseInt(options.timeout, 10) * 1000
    : DEFAULT_TIMEOUT_MS;

  const { getRenown, generateSessionId } = await import(
    "../../services/auth.js"
  );

  const renown = await getRenown();

  // Check if already authenticated
  if (renown.user) {
    console.log(`Already authenticated as ${renown.user.address}`);
    console.log('Use "ph login --logout" to sign out first.');
    return;
  }

  // Get the CLI's DID from Renown
  console.log(`CLI DID: ${renown.did}`);

  // Generate session ID
  const sessionId = generateSessionId();

  // Build the login URL with connect DID
  const loginUrl = new URL(`${renownUrl}/console`);
  loginUrl.searchParams.set("session", sessionId);
  loginUrl.searchParams.set("connect", renown.did);
  loginUrl.searchParams.set("app", renown.did);

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

  const user = await renown.login(result.did);

  console.log();
  console.log("Successfully authenticated!");
  console.log(`  ETH Address: ${user.address}`);
  console.log(`  User DID: ${user.did}`);
  console.log(`  CLI DID: ${renown.did}`);
  console.log();
  console.log("The CLI can now act on behalf of your Ethereum identity.");
};

export function loginCommand(program: Command): Command {
  const loginCmd = program
    .command("login")
    .description("Authenticate with Renown using your Ethereum wallet")
    .option(
      "--renown-url <url>",
      `Renown server URL (default: ${DEFAULT_RENOWN_URL})`,
    )
    .option(
      "--timeout <seconds>",
      "Authentication timeout in seconds (default: 300)",
    )
    .option("--logout", "Sign out and clear stored credentials")
    .option("--status", "Show current authentication status")
    .option("--show-did", "Show the CLI's DID and exit")
    .action(login);

  return setCustomHelp(loginCmd, loginHelp);
}
