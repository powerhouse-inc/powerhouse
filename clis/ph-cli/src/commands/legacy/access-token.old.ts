import type { Command } from "commander";
import { accessTokenHelp } from "../../help.js";
import type { CommandActionType } from "../../types.js";
import { setCustomHelp } from "../../utils.js";

export type AccessTokenOptions = {
  expiry?: string;
  audience?: string;
};

const SECONDS_IN_DAY = 24 * 60 * 60;
const DEFAULT_EXPIRY_DAYS = 7;
const DEFAULT_EXPIRY_SECONDS = DEFAULT_EXPIRY_DAYS * SECONDS_IN_DAY;

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

export const accessToken: CommandActionType<[AccessTokenOptions]> = async (
  options,
) => {
  const { getRenown } = await import("../../services/auth.js");
  const renown = await getRenown();
  const user = renown.user;
  // Require Renown authentication - user must have done 'ph login'
  if (!user || !user.credential) {
    throw new Error(
      "Not authenticated. Run 'ph login' first to authenticate with Renown. A Renown credential is required to generate valid bearer tokens.",
    );
  }

  const address = user.address;

  // Parse expiry
  let expiresIn = DEFAULT_EXPIRY_SECONDS;
  if (options.expiry) {
    try {
      expiresIn = parseExpiry(options.expiry);
    } catch (e) {
      console.error((e as Error).message);
      process.exit(1);
    }
  }

  // Generate the bearer token
  const token = await renown.getBearerToken(
    {
      expiresIn,
      aud: options.audience,
    },
    true,
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
  console.error(`CLI DID: ${renown.did}`);
  console.error(`ETH Address: ${address}`);
  console.error(`Token expires in: ${expiryStr}`);
  console.error("");

  // Output just the token to stdout (for easy piping/copying)
  console.log(token);
};

export function accessTokenCommand(program: Command): Command {
  const cmd = program
    .command("access-token")
    .description("Generate a bearer token for API authentication")
    .option(
      "--expiry <duration>",
      `Token expiry duration. Supports: "7d" (days), "24h" (hours), "3600" or "3600s" (seconds). Default: ${DEFAULT_EXPIRY_DAYS}d`,
    )
    .option("--audience <url>", "Target audience URL for the token (optional)")
    .action(accessToken);

  return setCustomHelp(cmd, accessTokenHelp);
}
