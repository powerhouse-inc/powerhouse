#!/usr/bin/env tsx
// Powerhouse monorepo — interactive release helper.
//
// Walks you through a dev, staging, or production release end-to-end:
// branch prep, optional baseline / merge / release-notes work, the workflow
// trigger, and (for production) the Discord announcement.
//
// Companion to:
//   - .github/workflows/release-branch.yml
//   - releases/release.ts
//   - RELEASE.md  (the procedural guide this script automates)
//   - .claude/skills/release-notes/SKILL.md  (release-notes generator)
//
// Run with `pnpm release-wizard` from the repo root. See ./README.md for details.

import { boolean, command, flag, number, option, optional, run } from "cmd-ts";

import { AbortError, FatalError, type ReleaseContext } from "./lib.js";
import {
  chdirToRepoRoot,
  currentBranch,
  currentHeadShort,
  killTrackedChildren,
  resolveRepoPath,
  runQuiet,
  workingTreeClean,
} from "./exec.js";
import {
  chalk,
  err,
  info,
  ok,
  renderScreen,
  restoreCursor,
  section,
  selectOption,
  warn,
} from "./ui.js";
import { flowDev, flowProduction, flowStaging } from "./flows.js";

// Install signal/exit handlers as early as possible.
process.once("SIGINT", () => {
  killTrackedChildren("SIGTERM");
  process.stdout.write("\n  Interrupted.\n");
  process.exit(130);
});
process.once("SIGTERM", () => {
  killTrackedChildren("SIGTERM");
  process.exit(143);
});
process.on("exit", () => restoreCursor());

// When Ctrl-C is pressed inside an enquirer prompt, enquirer's keypress
// handler triggers cancel → stop → readline.pause on an already-closed
// readline, which throws ERR_USE_AFTER_CLOSE *after* the prompt's promise
// rejected and we already handled the cancel. Swallow it as a user abort.
process.on("uncaughtException", (e: unknown) => {
  const code = (e as { code?: string } | null)?.code;
  if (code === "ERR_USE_AFTER_CLOSE") {
    killTrackedChildren("SIGTERM");
    restoreCursor();
    process.stdout.write("\n  Interrupted.\n");
    process.exit(130);
  }
  killTrackedChildren("SIGTERM");
  restoreCursor();
  if (e instanceof Error) {
    process.stderr.write(`${e.stack ?? e.message}\n`);
  } else {
    process.stderr.write(`${String(e)}\n`);
  }
  process.exit(1);
});

const app = command({
  name: "release",
  description:
    "Interactive release helper (dev / staging / production). See ./scripts/release/README.md.",
  args: {
    dryRun: flag({
      long: "dry-run",
      description:
        "Never push to remote and never trigger the workflow. Local git ops still run.",
      type: boolean,
    }),
    checkDeps: flag({
      long: "check-deps",
      description: "Run only the dependency preflight, then exit.",
      type: boolean,
    }),
    resumeFrom: option({
      long: "resume-from",
      description:
        "Skip past every step below this number when re-entering a flow after a manual fix.",
      type: optional(number),
    }),
  },
  handler: async (args) => {
    try {
      const ctx = await runPreflight({
        dryRun: args.dryRun,
        resumeFrom: args.resumeFrom ?? 0,
        checkDepsOnly: args.checkDeps,
      });
      await pickChannel(ctx);
      process.exit(0);
    } catch (e) {
      handleTopLevelError(e);
    }
  },
});

// ---------- preflight ----------------------------------------------------

async function runPreflight(opts: {
  dryRun: boolean;
  resumeFrom: number;
  checkDepsOnly: boolean;
}): Promise<ReleaseContext> {
  section("Powerhouse monorepo — release helper");
  if (opts.dryRun) {
    info(chalk.yellow("⚠ SCRIPT --dry-run MODE"));
    info(chalk.yellow("  No git pushes. No workflow triggers."));
  }
  if (opts.resumeFrom > 0) {
    info(chalk.cyan(`↺ Resuming from step ${opts.resumeFrom}`));
  }

  const repoRoot = await chdirToRepoRoot();

  info("");
  info(chalk.bold("Dependencies — required:"));
  await checkRequired("git", "Install git: https://git-scm.com/downloads");

  info("");
  info(chalk.bold("Dependencies — optional:"));
  let hasGh = await checkOptional(
    "gh",
    [
      "  gh enables auto-triggering the release workflow and tailing runs.",
      "  Install:",
      "    brew install gh                   # macOS",
      "    sudo apt install gh               # Debian/Ubuntu",
      "    https://cli.github.com/           # all platforms",
      "  After install: gh auth login",
    ].join("\n"),
  );
  if (hasGh) {
    const auth = await runQuiet("gh", ["auth", "status"]);
    if (auth.exitCode === 0) {
      const who = await runQuiet("gh", ["api", "user", "--jq", ".login"]);
      const login = who.exitCode === 0 ? who.stdout.trim() : "?";
      ok(`gh authenticated as ${login}`);
    } else {
      warn("gh installed but not authenticated — run: gh auth login");
      info("Treating gh as unavailable for this run.");
      hasGh = false;
    }
  }

  const hasClaude = await checkOptional(
    "claude",
    [
      "  claude enables auto-generated release notes via the /release-notes skill.",
      "  Install: https://docs.claude.com/en/docs/claude-code",
      "  Without claude, you'll be guided through manual release-notes prep.",
    ].join("\n"),
  );

  if (opts.checkDepsOnly) {
    info("");
    info("Dependency check complete. Exiting (--check-deps).");
    process.exit(0);
  }

  info("");
  info(chalk.bold("Repo state:"));
  const repoPath = await resolveRepoPath();
  info(`  Repo:    ${repoPath}`);
  info(`  Branch:  ${await currentBranch()}`);
  info(`  HEAD:    ${await currentHeadShort()}`);

  if (!(await workingTreeClean())) {
    info("");
    throw new FatalError(
      "Working tree is NOT clean. Stash or commit your changes first.\n" +
        "    git status\n" +
        "    git stash      # if you want to keep them",
    );
  }
  ok("Working tree clean.");

  info("");
  info(chalk.bold("Fetching remote refs and tags…"));
  const fetch = await runQuiet("git", ["fetch", "--tags", "--prune", "origin"]);
  if (fetch.exitCode !== 0) {
    warn(
      "git fetch failed — proceeding with local view. Some tags may be stale.",
    );
  } else {
    ok("Fetched.");
  }

  return {
    dryRun: opts.dryRun,
    resumeFrom: opts.resumeFrom,
    hasGh,
    hasClaude,
    repoPath,
    repoRoot,
    currentStep: 0,
    discordOutPath: undefined,
  };
}

async function checkRequired(name: string, installHint: string): Promise<void> {
  if (await commandExists(name)) {
    ok(`${name}${await tryVersion(name)}`);
    return;
  }
  process.stderr.write(`\n`);
  throw new FatalError(
    `${name} is required but not installed.\n\n${installHint}`,
  );
}

async function checkOptional(
  name: string,
  installHint: string,
): Promise<boolean> {
  if (await commandExists(name)) {
    ok(`${name}${await tryVersion(name)}`);
    return true;
  }
  warn(`${name} not found — some steps will fall back to manual instructions.`);
  info("");
  process.stdout.write(`${installHint}\n\n`);
  return false;
}

async function commandExists(name: string): Promise<boolean> {
  const r = await runQuiet("/bin/sh", ["-c", `command -v ${shellQuote(name)}`]);
  return r.exitCode === 0 && r.stdout.trim().length > 0;
}

async function tryVersion(name: string): Promise<string> {
  switch (name) {
    case "git": {
      const r = await runQuiet("git", ["--version"]);
      if (r.exitCode !== 0) return "";
      const m = r.stdout.trim().match(/version\s+(\S+)/);
      return m ? ` ${m[1]}` : "";
    }
    case "gh": {
      const r = await runQuiet("gh", ["--version"]);
      if (r.exitCode !== 0) return "";
      const first = r.stdout.split("\n")[0] ?? "";
      const m = first.match(/version\s+(\S+)/);
      return m ? ` ${m[1]}` : "";
    }
    case "claude": {
      const r = await runQuiet("claude", ["--version"]);
      if (r.exitCode !== 0) return "";
      const first = r.stdout.trim().split("\n")[0] ?? "";
      const token = first.split(/\s+/)[0] ?? "";
      return token ? ` ${token}` : "";
    }
    default:
      return "";
  }
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

// ---------- channel picker -----------------------------------------------

async function pickChannel(ctx: ReleaseContext): Promise<void> {
  ctx.flowName = "Powerhouse release";
  ctx.targetSummary = ctx.dryRun
    ? "dry-run mode (no pushes, no triggers)"
    : undefined;
  renderScreen(ctx, "What are you releasing?");
  info("");
  const choice = await selectOption<"dev" | "staging" | "prod" | "quit">(
    "Pick",
    [
      { name: "dev", message: "dev      (publish from main)" },
      { name: "staging", message: "staging  (publish from release/staging/…)" },
      { name: "prod", message: "prod     (publish from release/production/…)" },
      { name: "quit", message: "quit" },
    ],
    { ctx },
  );

  switch (choice) {
    case "dev":
      await flowDev(ctx);
      return;
    case "staging":
      await flowStaging(ctx);
      return;
    case "prod":
      await flowProduction(ctx);
      return;
    case "quit":
      info("Bye.");
      process.exit(0);
  }
}

// ---------- top-level error handling -------------------------------------

function handleTopLevelError(e: unknown): never {
  killTrackedChildren("SIGTERM");
  restoreCursor();

  if (e instanceof AbortError) {
    info("");
    err(`Aborted at Step ${e.resumeStep}.`);
    info("Local state preserved. To continue later:");
    info(`    pnpm release-wizard --resume-from=${e.resumeStep}`);
    process.exit(e.exitCode);
  }

  if (e instanceof FatalError) {
    err(e.message);
    process.exit(e.exitCode);
  }

  err("Unexpected error:");
  if (e instanceof Error) {
    process.stderr.write(`${e.stack ?? e.message}\n`);
  } else {
    process.stderr.write(`${String(e)}\n`);
  }
  process.exit(1);
}

await run(app, process.argv.slice(2));
