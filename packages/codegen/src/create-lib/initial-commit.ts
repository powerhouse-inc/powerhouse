import chalk from "chalk";
import { execFileSync } from "node:child_process";

export const INITIAL_COMMIT_MESSAGE = "ph init";

export type InitialCommitResult =
  | { committed: true }
  | { committed: false; reason: string };

function git(cwd: string, args: string[]) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function gitConfig(cwd: string, key: string) {
  try {
    return git(cwd, ["config", "--get", key]);
  } catch {
    return "";
  }
}

/** The identity settings git would refuse or have to guess, if any. */
export function missingGitIdentity(cwd: string) {
  const missing: string[] = [];
  if (!process.env.GIT_AUTHOR_NAME && !gitConfig(cwd, "user.name")) {
    missing.push("user.name");
  }
  if (!process.env.GIT_AUTHOR_EMAIL && !gitConfig(cwd, "user.email")) {
    missing.push("user.email");
  }
  return missing;
}

/** Commits every file of a repository `ph init` just created. Never throws. */
export function commitInitialProject(cwd: string): InitialCommitResult {
  const missing = missingGitIdentity(cwd);
  if (missing.length > 0) {
    return {
      committed: false,
      reason: `git has no ${missing.join(" or ")} configured`,
    };
  }
  try {
    git(cwd, ["add", "--all"]);
    git(cwd, ["commit", "--quiet", "--message", INITIAL_COMMIT_MESSAGE]);
    return { committed: true };
  } catch (error) {
    const stderr = (error as { stderr?: unknown }).stderr;
    const detail =
      typeof stderr === "string" && stderr.trim()
        ? stderr.trim()
        : String(error);
    return { committed: false, reason: `git commit failed: ${detail}` };
  }
}

export function commitInitialProjectAndReport(cwd: string) {
  console.log(chalk.blue(`▶️ Committing the project files...\n`));
  const result = commitInitialProject(cwd);
  if (result.committed) {
    console.log(
      chalk.green(
        `✅ Committed the project files as "${INITIAL_COMMIT_MESSAGE}"\n`,
      ),
    );
  } else {
    console.warn(
      chalk.yellow(
        `⚠️  Skipped the initial commit: ${result.reason}.\n` +
          `   Commit the files yourself before running \`ph migrate\`, which stops on uncommitted agent files.\n`,
      ),
    );
  }
  return result;
}
