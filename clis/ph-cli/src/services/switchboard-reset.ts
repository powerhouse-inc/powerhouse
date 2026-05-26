import { yellow, red, green, cyan } from "colorette";
import { promises as fs } from "node:fs";

export interface ResetSwitchboardOptions {
  dbPath?: string;
  yes?: boolean;
}

export interface ResolvedResetPaths {
  reactorDir: string | null;
  readModelDir: string | null;
  postgresUrl: string | null;
}

const CONFIRMATION_TOKEN = "reset";

export function isPostgresUrl(url: string): boolean {
  return url.startsWith("postgresql://") || url.startsWith("postgres://");
}

function isInteractive(): boolean {
  return Boolean(process.stdin.isTTY) && !process.env.CI;
}

/**
 * Resolves the on-disk PGlite directories that `--reset` would delete.
 * Mirrors the resolution in apps/switchboard/src/server.mts so we touch the
 * same paths the running switchboard uses. When a Postgres URL is configured
 * the corresponding directory is null and `postgresUrl` is populated so the
 * caller can refuse.
 */
export function resolveResetPaths(
  options: ResetSwitchboardOptions,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedResetPaths {
  const readModelDbPath =
    options.dbPath ?? env.DATABASE_URL ?? env.PH_SWITCHBOARD_DATABASE_URL;
  const readModelPath = readModelDbPath || ".ph/read-storage";
  const reactorDbUrl =
    options.dbPath ??
    env.PH_REACTOR_DATABASE_URL ??
    env.PH_SWITCHBOARD_DATABASE_URL;
  const reactorPath = reactorDbUrl || "./.ph/reactor-storage";

  const reactorIsPostgres = !!reactorDbUrl && isPostgresUrl(reactorDbUrl);
  const readModelIsPostgres =
    !!readModelDbPath && isPostgresUrl(readModelDbPath);

  let postgresUrl: string | null = null;
  if (reactorIsPostgres) postgresUrl = reactorDbUrl as string;
  else if (readModelIsPostgres) postgresUrl = readModelDbPath as string;

  return {
    reactorDir: reactorIsPostgres ? null : reactorPath,
    readModelDir: readModelIsPostgres ? null : readModelPath,
    postgresUrl,
  };
}

async function promptForConfirmation(): Promise<boolean> {
  const enquirer = await import("enquirer");
  try {
    const answer = await enquirer.default.prompt<{ confirmation: string }>({
      type: "input",
      name: "confirmation",
      message: `Type "${CONFIRMATION_TOKEN}" to confirm wiping the local switchboard databases:`,
    });
    return answer.confirmation.trim() === CONFIRMATION_TOKEN;
  } catch {
    return false;
  }
}

export async function resetSwitchboardDatabase(
  options: ResetSwitchboardOptions,
): Promise<void> {
  const paths = resolveResetPaths(options);

  if (paths.postgresUrl) {
    console.error(
      red(
        `Refusing to reset: a PostgreSQL URL is configured (${paths.postgresUrl}).`,
      ),
    );
    console.error(
      yellow(
        "`ph switchboard --reset` only wipes the local PGlite stores. " +
          "To reset a Postgres-backed switchboard, drop/recreate the database manually.",
      ),
    );
    process.exit(1);
  }

  const targets = [paths.reactorDir, paths.readModelDir].filter(
    (d): d is string => d !== null,
  );

  if (targets.length === 0) {
    console.error(red("No local PGlite directories resolved; nothing to do."));
    process.exit(1);
  }

  console.log(yellow("The following directories will be permanently deleted:"));
  for (const dir of targets) {
    console.log(`  - ${dir}`);
  }
  console.log(
    yellow(
      "This will wipe all local switchboard state. Migrations will re-run on next `ph switchboard`.",
    ),
  );

  let confirmed = false;
  if (options.yes) {
    confirmed = true;
  } else if (isInteractive()) {
    confirmed = await promptForConfirmation();
  } else {
    console.error(
      red(
        "Refusing to reset in a non-interactive context without --yes. Re-run with --yes to confirm.",
      ),
    );
    process.exit(1);
  }

  if (!confirmed) {
    console.error(red("Aborted: confirmation not provided."));
    process.exit(1);
  }

  for (const dir of targets) {
    await fs.rm(dir, { recursive: true, force: true });
    console.log(cyan(`Removed ${dir}`));
  }

  console.log(
    green(
      "Switchboard local storage reset. Run `ph switchboard` to re-initialize.",
    ),
  );
}
