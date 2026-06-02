import { isPortAvailable } from "@powerhousedao/switchboard/server";
import { yellow } from "colorette";

const MAX_FALLBACK_ATTEMPTS = 20;

function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY) && !process.env.CI;
}

async function findFreePort(start: number): Promise<number | null> {
  for (let i = 0; i < MAX_FALLBACK_ATTEMPTS; i++) {
    const candidate = start + i;
    if (await isPortAvailable(candidate)) return candidate;
  }
  return null;
}

/**
 * Resolve the port switchboard should bind to. If the requested port is free,
 * returns it unchanged. If it's in use, walks forward for the next free port
 * and — in an interactive terminal — asks the user to confirm the fallback.
 * In CI / piped contexts the fallback is applied automatically so scripts
 * don't hang on an unanswered prompt.
 *
 * Throws a process.exit(1) when the user declines the prompt or when no free
 * port is available in the search window.
 */
export async function resolveSwitchboardPort(
  requested: number,
): Promise<number> {
  if (await isPortAvailable(requested)) return requested;

  const candidate = await findFreePort(requested + 1);
  if (candidate === null) {
    console.error(
      `Port ${requested} is in use and no free port was found in the range ${requested}-${requested + MAX_FALLBACK_ATTEMPTS - 1}.`,
    );
    process.exit(1);
  }

  if (!isInteractive()) {
    console.log(
      yellow(
        `Port ${requested} is in use. Falling back to port ${candidate} (non-interactive; skipping confirmation).`,
      ),
    );
    return candidate;
  }

  const enquirer = await import("enquirer");

  let confirmed: boolean;
  try {
    const answer = await enquirer.default.prompt<{ confirmed: boolean }>({
      type: "confirm",
      name: "confirmed",
      message: `Port ${requested} is in use. Use port ${candidate} instead?`,
      initial: true,
    });
    confirmed = answer.confirmed;
  } catch {
    // user aborted the prompt (Ctrl-C); treat as decline
    confirmed = false;
  }

  if (!confirmed) {
    console.error(
      `Aborted. Free port ${requested} or pass --switchboard-port <port> to choose a different port.`,
    );
    process.exit(1);
  }

  return candidate;
}
