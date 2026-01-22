import {
  accessTokenArgs,
  DEFAULT_EXPIRY_SECONDS,
  SECONDS_IN_DAY,
} from "@powerhousedao/common/clis";
import { command } from "cmd-ts";
import {
  getConnectCrypto,
  getConnectDid,
  isAuthenticated,
  loadCredentials,
} from "../services/auth.js";
export const accessToken = command({
  name: "access-token",
  description: `
The access-token command generates a bearer token for API authentication. This token
can be used to authenticate requests to Powerhouse APIs like reactor-api (Switchboard).

This command:
1. Uses your CLI's cryptographic identity (DID) to sign a verifiable credential
2. Creates a JWT bearer token with configurable expiration
3. Outputs the token to stdout (info to stderr) for easy piping

Prerequisites:
  You must have a cryptographic identity. Run 'ph login' first to:
  - Generate a keypair (stored in .keypair.json)
  - Optionally link your Ethereum address (stored in .auth.json)

Token Details:
  The generated token is a JWT (JSON Web Token) containing:
  - Issuer (iss): Your CLI's DID (did:key:...)
  - Subject (sub): Your CLI's DID
  - Credential Subject: Chain ID, network ID, and address (if authenticated)
  - Expiration (exp): Based on --expiry option
  - Audience (aud): If --audience is specified

Output:
- Token information (DID, address, expiry) is printed to stderr
- The token itself is printed to stdout for easy piping/copying

This allows you to use the command in scripts:
  TOKEN=$(ph access-token)
  curl -H "Authorization: Bearer $TOKEN" http://localhost:4001/graphql

Usage with APIs:
  Generate token and use with curl
  TOKEN=$(ph access-token --expiry 1d)
  curl -X POST http://localhost:4001/graphql \\
    -H "Content-Type: application/json" \\
    -H "Authorization: Bearer $TOKEN" \\
    -d '{"query": "{ drives { id name } }"}'

  Export as environment variable
  export PH_ACCESS_TOKEN=$(ph access-token)

Notes:
  - Tokens are self-signed using your CLI's private key
  - No network request is made; tokens are generated locally
  - The recipient API must trust your CLI's DID to accept the token
  - For reactor-api, ensure AUTH_ENABLED=true to require authentication
`,
  args: accessTokenArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log(args);
    }
    // Require Renown authentication - user must have done 'ph login'
    if (!isAuthenticated()) {
      console.error(
        "Not authenticated. Run 'ph login' first to authenticate with Renown.",
      );
      console.error(
        "A Renown credential is required to generate valid bearer tokens.",
      );
      process.exit(1);
    }

    const creds = loadCredentials();
    if (!creds) {
      console.error("Failed to load credentials.");
      process.exit(1);
    }

    // Get the CLI's DID
    let did: string;
    try {
      did = await getConnectDid();
    } catch (e) {
      console.error(
        "Failed to get CLI identity. Run 'ph login' to reinitialize.",
      );
      process.exit(1);
    }

    const address = creds.address;

    // Parse expiry
    let expiresIn = DEFAULT_EXPIRY_SECONDS;
    if (args.expiry) {
      try {
        expiresIn = parseExpiry(args.expiry);
      } catch (e) {
        console.error((e as Error).message);
        process.exit(1);
      }
    }

    // Generate the bearer token
    const crypto = await getConnectCrypto();
    const token = await crypto.getBearerToken(
      args.audience ?? "",
      address,
      true, // Force refresh to ensure we get a new token with the specified expiry
      {
        expiresIn,
        aud: args.audience,
      },
    );

    // Calculate human-readable expiry
    const expiryDays = Math.floor(expiresIn / SECONDS_IN_DAY);
    const expiryHours = Math.floor((expiresIn % SECONDS_IN_DAY) / 3600);
    let expiryStr: string;
    if (expiryDays > 0) {
      expiryStr =
        expiryHours > 0
          ? `${expiryDays} day${expiryDays > 1 ? "s" : ""} and ${expiryHours} hour${expiryHours > 1 ? "s" : ""}`
          : `${expiryDays} day${expiryDays > 1 ? "s" : ""}`;
    } else if (expiryHours > 0) {
      expiryStr = `${expiryHours} hour${expiryHours > 1 ? "s" : ""}`;
    } else {
      expiryStr = `${expiresIn} seconds`;
    }

    // Output token info to stderr, token itself to stdout for piping
    console.error(`CLI DID: ${did}`);
    console.error(`ETH Address: ${address}`);
    console.error(`Token expires in: ${expiryStr}`);
    console.error("");

    // Output just the token to stdout (for easy piping/copying)
    console.log(token);
  },
});

/**
 * Parse expiry string to seconds
 * Supports formats: "7d" (days), "24h" (hours), "3600" (seconds), "3600s" (seconds)
 */
function parseExpiry(expiry: string): number {
  const trimmed = expiry.trim().toLowerCase();

  // Check for day format (e.g., "7d")
  if (trimmed.endsWith("d")) {
    const days = parseInt(trimmed.slice(0, -1), 10);
    if (isNaN(days) || days <= 0) {
      throw new Error(
        `Invalid expiry format: ${expiry}. Days must be a positive number.`,
      );
    }
    return days * SECONDS_IN_DAY;
  }

  // Check for hour format (e.g., "24h")
  if (trimmed.endsWith("h")) {
    const hours = parseInt(trimmed.slice(0, -1), 10);
    if (isNaN(hours) || hours <= 0) {
      throw new Error(
        `Invalid expiry format: ${expiry}. Hours must be a positive number.`,
      );
    }
    return hours * 60 * 60;
  }

  // Check for seconds format (e.g., "3600s" or just "3600")
  const numericValue = trimmed.endsWith("s") ? trimmed.slice(0, -1) : trimmed;

  const seconds = parseInt(numericValue, 10);
  if (isNaN(seconds) || seconds <= 0) {
    throw new Error(
      `Invalid expiry format: ${expiry}. Expected a positive number or format like "7d", "24h", "3600s".`,
    );
  }

  return seconds;
}
