// All release flows: dev, staging (3 sub-cases), production. Each declares
// its own TOTAL step count, walks the user through prep / push / trigger /
// finalize, and refreshes ctx.targetSummary so the wizard header stays
// accurate as values are picked.

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  AbortError,
  DISCORD_CHANNEL,
  FatalError,
  RELEASE_NOTES_FILE,
  SKILL_PATH,
  type ReleaseContext,
} from "./lib.js";
import {
  askDryRunInput,
  doPush,
  doTriggerWorkflow,
  generateNotesWithClaude,
  printManualNotesInstructions,
} from "./actions.js";
import {
  branchVersion,
  currentBranch,
  currentWorkspaceVersion,
  hasConflictMarkers,
  latestDevTag,
  latestProductionTag,
  latestStagingTag,
  latestStagingTagOn,
  listOriginStagingBranches,
  localBranchExists,
  mergeInProgress,
  runLocal,
  unmergedPaths,
  workspaceVersionsAfterBaseline,
} from "./exec.js";
import {
  askYesNo,
  chalk,
  confirm,
  confirmAction,
  info,
  ok,
  readLine,
  renderScreen,
  selectOption,
  step,
  waitForEnter,
  warn,
} from "./ui.js";

// =========================================================================
// Dev flow — 4 steps
// =========================================================================

export async function flowDev(ctx: ReleaseContext): Promise<void> {
  const TOTAL = 4;
  ctx.flowName = "DEV release";
  refreshDevTarget(ctx, "?");

  await step(ctx, 1, TOTAL, "Verify branch & sync", async () => {
    const cur = await currentBranch();
    if (cur !== "main") {
      info(`You're on: ${cur}`);
      await confirmAction(ctx, "Switch to main", "git", ["checkout", "main"]);
    }
    ok("On main.");
    await confirmAction(
      ctx,
      "Pull latest from origin/main (fast-forward only)",
      "git",
      ["pull", "--ff-only", "origin", "main"],
    );
  });

  await step(ctx, 2, TOTAL, "Show target", async () => {
    info(`Latest dev tag:  ${(await latestDevTag()) || "(none)"}`);
    info(`Workspace ver:   ${currentWorkspaceVersion(ctx.repoRoot)}`);
    info(
      "Next dev tag:    auto (Nx computes from package.json + release_mode=prerelease)",
    );
  });

  let dryInput: "true" | "false" = "true";
  await step(ctx, 3, TOTAL, "Choose run mode", async () => {
    dryInput = await askDryRunInput(ctx, "dev");
    refreshDevTarget(ctx, dryInput);
  });

  await step(ctx, 4, TOTAL, "Trigger workflow", async () => {
    await doTriggerWorkflow(ctx, "main", "prerelease", dryInput);
  });

  info("");
  ok("Dev flow complete.");
}

function refreshDevTarget(
  ctx: ReleaseContext,
  dryInput: "true" | "false" | "?",
): void {
  const dryLabel = dryInput === "?" ? "?" : dryInput;
  const scriptDry = ctx.dryRun ? " | script: --dry-run" : "";
  ctx.targetSummary = `branch=main | mode=prerelease | workflow dry_run=${dryLabel}${scriptDry}`;
}

// =========================================================================
// Staging dispatcher
// =========================================================================

const NEW_ADJACENT_CHOICE = "::new-adjacent";
const NEW_SPECIFIC_CHOICE = "::new-specific";
const CONTINUE_PREFIX = "continue::";

export async function flowStaging(ctx: ReleaseContext): Promise<void> {
  ctx.flowName = "STAGING release";
  ctx.targetSummary = ctx.dryRun ? "script: --dry-run" : undefined;

  // Existing staging branches show up as direct picks ("Continue …") so the
  // user can choose a branch and a subflow in one screen, no separate survey.
  const branches = await listOriginStagingBranches();
  const continueChoices = await Promise.all(
    branches.map(async (b) => {
      const bver = branchVersion(b);
      const btag = await latestStagingTagOn(`origin/${b}`, bver);
      return {
        name: `${CONTINUE_PREFIX}${b}`,
        message: `Continue ${b} → next prerelease  (${btag || "no tags"})`,
      };
    }),
  );

  const choices: { name: string; message: string }[] = [
    ...continueChoices,
    {
      name: NEW_ADJACENT_CHOICE,
      message:
        "Cut a NEW line from main — patch / minor / major from main's current version",
    },
    {
      name: NEW_SPECIFIC_CHOICE,
      message:
        "Cut a NEW line at a SPECIFIC version — type it in (e.g. 6.0.3-staging.1, used when skipping versions)",
    },
  ];

  renderScreen(ctx, "What are you doing?");
  info("");
  const choice = await selectOption("Pick", choices, { ctx });

  if (choice.startsWith(CONTINUE_PREFIX)) {
    const branch = choice.slice(CONTINUE_PREFIX.length);
    await flowStagingContinue(ctx, branch);
    return;
  }
  if (choice === NEW_ADJACENT_CHOICE) {
    await flowStagingNewAdjacent(ctx);
    return;
  }
  if (choice === NEW_SPECIFIC_CHOICE) {
    await flowStagingNonAdjacent(ctx);
    return;
  }
}

// =========================================================================
// Staging — continue an existing line (bash Case 2). 6 steps.
// Branch is pre-selected by the dispatcher.
// =========================================================================

async function flowStagingContinue(
  ctx: ReleaseContext,
  branch: string,
): Promise<void> {
  const TOTAL = 6;
  refreshContinueTarget(ctx, branch, "?");

  await step(ctx, 1, TOTAL, "Show target", async () => {
    const bver = branchVersion(branch);
    const currentTag = await latestStagingTagOn(`origin/${branch}`, bver);
    info(`Branch:           ${branch}`);
    info(`Latest tag here:  ${currentTag || "(no tags)"}`);
    const nextHint = currentTag
      ? `${currentTag.replace(/\.\d+$/, "")}.<N+1>`
      : "<X.Y.Z-staging.1>";
    info(`Next publish:     ${nextHint}  (Nx bumps the trailing number)`);
  });

  await step(ctx, 2, TOTAL, "Checkout + pull", async () => {
    await confirmAction(ctx, `Switch to ${branch}`, "git", [
      "checkout",
      branch,
    ]);
    await confirmAction(
      ctx,
      `Pull latest from origin/${branch} (fast-forward only)`,
      "git",
      ["pull", "--ff-only", "origin", branch],
    );
    ok(`${branch} up to date with origin.`);
  });

  await step(ctx, 3, TOTAL, "Fetch + merge origin/main", async () => {
    await confirmAction(ctx, "Fetch latest origin/main from remote", "git", [
      "fetch",
      "origin",
      "main",
    ]);
    await confirmAction(
      ctx,
      `Merge origin/main into ${branch} (conflicts expected on package.json + CHANGELOG.md)`,
    );

    info("Running merge…");
    const mergeR = await runLocal("git", ["merge", "origin/main"], {
      allowFailure: true,
    });

    if (mergeR.exitCode === 0) {
      ok("Merge clean (no conflicts).");
      return;
    }

    warn("Merge conflicts detected.");
    info("");
    info(
      chalk.bold(
        "Resolve the merge yourself, KEEPING THE STAGING SIDE for version + changelog files.",
      ),
    );
    info(
      "Fast path — run these in another terminal (they're single-line, copy-paste friendly):",
    );
    info("");
    process.stdout.write(
      `      ${chalk.cyan("git checkout --ours -- package.json '**/package.json' CHANGELOG.md '**/CHANGELOG.md'")}\n`,
    );
    process.stdout.write(
      `      ${chalk.cyan("git add package.json '**/package.json' CHANGELOG.md '**/CHANGELOG.md'")}\n`,
    );
    info("");
    info(
      "Then resolve any remaining non-version conflicts normally, stage them,",
    );
    info(
      `and ${chalk.bold("commit the merge yourself")} (e.g. ${chalk.cyan("git commit --no-edit")}). The script will NOT commit for you.`,
    );
    info("Once the merge commit is in place, come back here and confirm.");

    for (;;) {
      info("");
      const done = await askYesNo(
        "Have you finished resolving, staging, and committing the merge?",
        false,
      );
      if (!done) {
        info("Still waiting on the merge. Re-prompting…");
        continue;
      }
      if (mergeInProgress(ctx.repoRoot)) {
        warn(
          "Merge is still in progress — .git/MERGE_HEAD is present, so you haven't committed yet.",
        );
        info(
          `Commit the merge (e.g. ${chalk.cyan("git commit --no-edit")}) and confirm again.`,
        );
        continue;
      }
      const unmerged = await unmergedPaths();
      if (unmerged.length > 0) {
        warn("Unmerged paths remain:");
        for (const p of unmerged) info(`    ${p}`);
        continue;
      }
      if (await hasConflictMarkers()) {
        warn(
          "Conflict markers still present in tracked files. Clean them up and commit before confirming.",
        );
        continue;
      }
      break;
    }
    ok("Merge resolved and committed.");
  });

  await step(ctx, 4, TOTAL, "Push to origin", async () => {
    await doPush(ctx, branch);
  });

  let dryInput: "true" | "false" = "true";
  await step(ctx, 5, TOTAL, "Choose run mode", async () => {
    dryInput = await askDryRunInput(ctx, "staging");
    refreshContinueTarget(ctx, branch, dryInput);
  });

  await step(ctx, 6, TOTAL, "Trigger workflow", async () => {
    await doTriggerWorkflow(ctx, branch, "prerelease", dryInput);
  });

  info("");
  ok("Staging flow complete.");
}

function refreshContinueTarget(
  ctx: ReleaseContext,
  branch: string,
  dryInput: "true" | "false" | "?",
): void {
  const dryLabel = dryInput === "?" ? "?" : dryInput;
  const scriptDry = ctx.dryRun ? " | script: --dry-run" : "";
  ctx.targetSummary = `case: continue line | branch=${branch} | mode=prerelease | workflow dry_run=${dryLabel}${scriptDry}`;
}

// =========================================================================
// Staging — new line from main, adjacent semver bump (bash Case 1). 6 steps.
// =========================================================================

type AdjacentMode = "prerelease" | "patch" | "minor" | "major";

async function flowStagingNewAdjacent(ctx: ReleaseContext): Promise<void> {
  const TOTAL = 6;

  let mode: AdjacentMode = "prerelease";
  let branch = "";
  const cwv = currentWorkspaceVersion(ctx.repoRoot);
  const base = cwv.replace(/-dev.*$/, "");
  refreshNewAdjacentTarget(ctx, branch, mode, "?");

  await step(ctx, 1, TOTAL, "Choose semver bump", async () => {
    info(`Main workspace version: ${cwv}`);
    info("Pick the bump:");
    mode = await selectOption<AdjacentMode>(
      "Pick",
      [
        {
          name: "prerelease",
          message: `prerelease → ${base}-staging.1 (same base as main)`,
        },
        { name: "patch", message: "patch      → next patch -staging.1" },
        { name: "minor", message: "minor      → next minor -staging.1" },
        { name: "major", message: "major      → next major -staging.1" },
      ],
      { ctx },
    );
    refreshNewAdjacentTarget(ctx, branch, mode, "?");
  });

  await step(ctx, 2, TOTAL, "Branch name", async () => {
    info("Enter the target branch name (e.g. release/staging/6.1.0).");
    process.stdout.write("  Branch > ");
    const input = (await readLine()).trim();
    if (!input) {
      throw new FatalError("Branch name required.");
    }
    if (!input.startsWith("release/staging/")) {
      throw new FatalError("Branch must be release/staging/<version>.");
    }
    branch = input;
    refreshNewAdjacentTarget(ctx, branch, mode, "?");
  });

  await step(ctx, 3, TOTAL, "Checkout main, pull", async () => {
    await confirmAction(ctx, "Switch to main", "git", ["checkout", "main"]);
    await confirmAction(
      ctx,
      "Pull latest from origin/main (fast-forward only)",
      "git",
      ["pull", "--ff-only", "origin", "main"],
    );
  });

  await step(ctx, 4, TOTAL, "Create branch", async () => {
    if (await localBranchExists(branch)) {
      info(`Local branch ${branch} already exists.`);
      if (!(await confirm(ctx, "Delete and recreate from main?", false))) {
        throw new FatalError("Aborting to avoid clobbering existing branch.");
      }
      await confirmAction(ctx, `Delete local branch ${branch}`, "git", [
        "branch",
        "-D",
        branch,
      ]);
    }
    await confirmAction(ctx, `Create branch ${branch} from main`, "git", [
      "checkout",
      "-b",
      branch,
      "main",
    ]);
    ok(`Created ${branch}.`);
  });

  await step(ctx, 5, TOTAL, "Push branch to origin", async () => {
    await doPush(ctx, branch);
  });

  await step(ctx, 6, TOTAL, "Trigger workflow", async () => {
    info(`Release mode: ${mode}`);
    const dryInput = await askDryRunInput(ctx, "staging");
    refreshNewAdjacentTarget(ctx, branch, mode, dryInput);
    await doTriggerWorkflow(ctx, branch, mode, dryInput);
  });

  info("");
  ok("Staging flow complete.");
}

function refreshNewAdjacentTarget(
  ctx: ReleaseContext,
  branch: string,
  mode: AdjacentMode,
  dryInput: "true" | "false" | "?",
): void {
  const dryLabel = dryInput === "?" ? "?" : dryInput;
  const scriptDry = ctx.dryRun ? " | script: --dry-run" : "";
  const branchLabel = branch || "(pending)";
  ctx.targetSummary = `case: new line | branch=${branchLabel} | mode=${mode} | workflow dry_run=${dryLabel}${scriptDry}`;
}

// =========================================================================
// Staging — non-adjacent version with baseline (bash Case 3). 7 steps.
// =========================================================================

async function flowStagingNonAdjacent(ctx: ReleaseContext): Promise<void> {
  const TOTAL = 7;

  let target = "";
  let baseline = "";
  let branch = "";
  refreshNonAdjacentTarget(ctx, branch, target, baseline, "?");

  await step(ctx, 1, TOTAL, "Target version", async () => {
    info(`Main workspace version:   ${currentWorkspaceVersion(ctx.repoRoot)}`);
    info(`Latest staging tag:       ${(await latestStagingTag()) || "(none)"}`);
    info("");
    info("Enter the target FIRST publish version (e.g. 6.0.3-staging.1):");
    process.stdout.write("  Target > ");
    const input = (await readLine()).trim();
    if (!/-staging\.\d+$/.test(input)) {
      throw new FatalError(
        "Target must be of the form X.Y.Z-staging.N (e.g. 6.0.3-staging.1).",
      );
    }
    target = input;

    const lastDot = input.lastIndexOf(".");
    const prefix = input.slice(0, lastDot);
    const trailing = Number.parseInt(input.slice(lastDot + 1), 10);
    if (!Number.isInteger(trailing) || trailing < 1) {
      throw new FatalError("Target trailing number must be >= 1.");
    }
    baseline = `${prefix}.${trailing - 1}`;

    // Branch is fully determined by the target — no separate prompt needed.
    const baseVersion = target.replace(/-staging\..*$/, "");
    branch = `release/staging/${baseVersion}`;

    info(`  → branch:         ${branch}`);
    info(`  → baseline:       ${baseline}`);
    info("  → workflow input: release_mode=prerelease");
    info(`  → result:         ${target}`);
    if (!(await confirm(ctx, `Confirm target ${target}?`, true))) {
      throw new FatalError("Aborting.");
    }
    refreshNonAdjacentTarget(ctx, branch, target, baseline, "?");
  });

  await step(ctx, 2, TOTAL, "Checkout main, pull", async () => {
    await confirmAction(ctx, "Switch to main", "git", ["checkout", "main"]);
    await confirmAction(
      ctx,
      "Pull latest from origin/main (fast-forward only)",
      "git",
      ["pull", "--ff-only", "origin", "main"],
    );
  });

  await step(ctx, 3, TOTAL, "Create branch + set baseline", async () => {
    if (await localBranchExists(branch)) {
      info(`Local branch ${branch} already exists.`);
      if (!(await confirm(ctx, "Delete and recreate from main?", false))) {
        throw new FatalError("Aborting.");
      }
      await confirmAction(ctx, `Delete local branch ${branch}`, "git", [
        "branch",
        "-D",
        branch,
      ]);
    }
    await confirmAction(ctx, `Create branch ${branch} from main`, "git", [
      "checkout",
      "-b",
      branch,
      "main",
    ]);

    if (ctx.dryRun) {
      info(
        "(nx release version runs for real even under --dry-run — local operation only.)",
      );
    }
    await confirmAction(
      ctx,
      `Write baseline version ${baseline} to every workspace package.json`,
      "npx",
      ["nx", "release", "version", baseline],
    );

    info("");
    info(`Sanity check (every package.json should show ${baseline}):`);
    const versions = await workspaceVersionsAfterBaseline();
    for (const v of versions) info(v);
    const inconsistent = versions.some((v) => !v.includes(baseline));
    if (inconsistent) {
      warn(`Not all package.json files match ${baseline}.`);
      if (!(await confirm(ctx, "Continue anyway?", false))) {
        throw new FatalError("Aborting.");
      }
    } else {
      ok("Consistent.");
    }
  });

  await step(ctx, 4, TOTAL, "Commit baseline", async () => {
    const msg = `chore(release): set baseline ${baseline} for staging cut`;
    await confirmAction(ctx, "Stage all baseline changes", "git", [
      "add",
      "-A",
    ]);
    await confirmAction(ctx, `Commit baseline ('${msg}')`, "git", [
      "commit",
      "-m",
      msg,
    ]);
  });

  await step(ctx, 5, TOTAL, "Push to origin", async () => {
    await doPush(ctx, branch);
  });

  let dryInput: "true" | "false" = "true";
  await step(ctx, 6, TOTAL, "Choose run mode", async () => {
    dryInput = await askDryRunInput(ctx, "staging");
    refreshNonAdjacentTarget(ctx, branch, target, baseline, dryInput);
  });

  await step(ctx, 7, TOTAL, "Trigger workflow", async () => {
    await doTriggerWorkflow(ctx, branch, "prerelease", dryInput);
  });

  info("");
  ok("Staging flow complete.");
}

function refreshNonAdjacentTarget(
  ctx: ReleaseContext,
  branch: string,
  target: string,
  baseline: string,
  dryInput: "true" | "false" | "?",
): void {
  const dryLabel = dryInput === "?" ? "?" : dryInput;
  const scriptDry = ctx.dryRun ? " | script: --dry-run" : "";
  const branchLabel = branch || "(pending)";
  const targetLabel = target || "(pending)";
  const baselineLabel = baseline || "(pending)";
  ctx.targetSummary = `case: non-adjacent | branch=${branchLabel} | target=${targetLabel} | baseline=${baselineLabel} | workflow dry_run=${dryLabel}${scriptDry}`;
}

// =========================================================================
// Production flow — 10 steps
// =========================================================================

type ProdMode = "patch" | "minor" | "major";

export async function flowProduction(ctx: ReleaseContext): Promise<void> {
  const TOTAL = 10;

  let stagingBranch = "";
  let prodBranch = "";
  let prodVersion = "";
  let mode: ProdMode = "patch";
  ctx.flowName = "PRODUCTION release";
  refreshProdTarget(ctx, stagingBranch, prodBranch, prodVersion, mode, "?");

  await step(
    ctx,
    1,
    TOTAL,
    "Survey + pick staging branch to promote",
    async () => {
      info(
        `Latest production tag:  ${(await latestProductionTag()) || "(none)"}`,
      );
      info("");
      info(chalk.bold("Active staging branches (recent first):"));
      const branches = await listOriginStagingBranches();
      if (branches.length === 0) {
        throw new FatalError(
          "No staging branches found on origin — can't promote.",
        );
      }
      const choices = await Promise.all(
        branches.map(async (b) => {
          const bver = branchVersion(b);
          const btag = await latestStagingTagOn(`origin/${b}`, bver);
          return { name: b, message: `${b}  (${btag || "no tags"})` };
        }),
      );
      stagingBranch = await selectOption("Pick", choices, { ctx });
      info(`Promoting: ${stagingBranch}`);
      refreshProdTarget(ctx, stagingBranch, prodBranch, prodVersion, mode, "?");
    },
  );

  await step(
    ctx,
    2,
    TOTAL,
    "Compute target + choose release_mode",
    async () => {
      const bver = branchVersion(stagingBranch);
      const currentStagingTag = await latestStagingTagOn(
        `origin/${stagingBranch}`,
        bver,
      );
      info(
        `Staging tag at HEAD of ${stagingBranch}: ${currentStagingTag || "(no tags)"}`,
      );
      info("");
      info("Pick release_mode:");
      mode = await selectOption<ProdMode>(
        "Pick",
        [
          {
            name: "patch",
            message: "patch   (normal promotion — strips -staging.N suffix)",
          },
          {
            name: "minor",
            message: "minor   (same effect when promoting X.Y.0-staging.N)",
          },
          {
            name: "major",
            message: "major   (bump major at promotion time — rare)",
          },
        ],
        { ctx },
      );

      prodVersion = stagingBranch.replace(/^release\/staging\//, "");
      prodBranch = `release/production/${prodVersion}`;
      info(`Production branch: ${prodBranch}`);
      info(
        `Expected publish:  v${prodVersion}  (Nx computes; this is what the workflow should output for mode=${mode})`,
      );
      if (!(await confirm(ctx, "Continue?", true))) {
        throw new FatalError("Aborting.");
      }
      refreshProdTarget(ctx, stagingBranch, prodBranch, prodVersion, mode, "?");
    },
  );

  await step(ctx, 3, TOTAL, "Create production branch", async () => {
    await confirmAction(ctx, `Switch to ${stagingBranch}`, "git", [
      "checkout",
      stagingBranch,
    ]);
    await confirmAction(
      ctx,
      `Pull latest from origin/${stagingBranch} (fast-forward only)`,
      "git",
      ["pull", "--ff-only", "origin", stagingBranch],
    );
    if (await localBranchExists(prodBranch)) {
      info(`Local branch ${prodBranch} already exists.`);
      if (
        !(await confirm(
          ctx,
          `Delete and recreate from ${stagingBranch}?`,
          false,
        ))
      ) {
        throw new FatalError("Aborting.");
      }
      await confirmAction(ctx, `Delete local branch ${prodBranch}`, "git", [
        "branch",
        "-D",
        prodBranch,
      ]);
    }
    await confirmAction(
      ctx,
      `Create branch ${prodBranch} from ${stagingBranch}`,
      "git",
      ["checkout", "-b", prodBranch, stagingBranch],
    );
    ok(`Created ${prodBranch} from ${stagingBranch}.`);
    await doPush(ctx, prodBranch);
  });

  await step(ctx, 4, TOTAL, "Update RELEASE-NOTES.md", async () => {
    const prevTag = await latestProductionTag();
    if (!prevTag) {
      throw new FatalError("Couldn't determine previous production tag.");
    }
    info(`Previous production tag: ${prevTag}`);
    info(`Range:                   ${prevTag}..HEAD`);
    info("");

    const discordOut = `/tmp/release-discord-${prodVersion}.md`;

    let useClaude = false;
    if (ctx.hasClaude) {
      useClaude = await confirm(
        ctx,
        "Generate release notes with Claude Code (/release-notes skill)?",
        true,
      );
    } else {
      warn(
        "claude CLI is not installed — falling back to manual instructions.",
      );
    }

    if (useClaude) {
      await generateNotesWithClaude({
        ctx,
        version: prodVersion,
        prevTag,
        discordOut,
      });
    } else {
      printManualNotesInstructions(prevTag, prodVersion, discordOut);
      await waitForEnter(
        `  Press Enter once RELEASE-NOTES.md has been updated and ${discordOut} has been saved… `,
      );
    }

    if (!fileNonEmpty(discordOut)) {
      warn(`Discord message file is empty or missing: ${discordOut}`);
      if (!(await confirm(ctx, "Continue anyway?", false))) {
        throw new AbortError(ctx.currentStep);
      }
    }
    ctx.discordOutPath = discordOut;
  });

  await step(ctx, 5, TOTAL, "Review the generated release notes", async () => {
    if (process.stdout.isTTY) {
      info(`Showing diff of ${RELEASE_NOTES_FILE} (q to exit pager)…`);
      await runDiffPager(ctx.repoRoot);
    } else {
      info("Skipping pager (not a TTY).");
    }
    if (
      !(await confirm(
        ctx,
        "Does the new release-notes section look correct?",
        false,
      ))
    ) {
      info(
        `Re-run with --resume-from=5 after you edit ${RELEASE_NOTES_FILE} manually.`,
      );
      throw new AbortError(ctx.currentStep);
    }
  });

  await step(ctx, 6, TOTAL, "Commit release notes", async () => {
    const msg = `docs: release notes for v${prodVersion}`;
    await confirmAction(ctx, `Stage ${RELEASE_NOTES_FILE}`, "git", [
      "add",
      RELEASE_NOTES_FILE,
    ]);
    await confirmAction(ctx, `Commit release notes ('${msg}')`, "git", [
      "commit",
      "-m",
      msg,
    ]);
  });

  await step(ctx, 7, TOTAL, "Push production branch", async () => {
    await doPush(ctx, prodBranch);
  });

  let doDry = true;
  await step(ctx, 8, TOTAL, "Choose run mode", async () => {
    doDry = await confirm(
      ctx,
      "Run a dry-run pass FIRST (recommended for production)?",
      true,
    );
    refreshProdTarget(
      ctx,
      stagingBranch,
      prodBranch,
      prodVersion,
      mode,
      doDry ? "true" : "false",
    );
  });

  await step(ctx, 9, TOTAL, "Trigger workflow", async () => {
    if (doDry) {
      info(chalk.bold("Dry run first."));
      await doTriggerWorkflow(ctx, prodBranch, mode, "true");
      info("");
      if (
        !(await confirm(ctx, "Dry run looked good — run for real now?", false))
      ) {
        info("OK — stopping after dry run.");
        info("Re-run with --resume-from=9 to do the real release.");
        throw new AbortError(9);
      }
    }
    info(chalk.bold("Real run."));
    refreshProdTarget(
      ctx,
      stagingBranch,
      prodBranch,
      prodVersion,
      mode,
      "false",
    );
    await doTriggerWorkflow(ctx, prodBranch, mode, "false");
  });

  await step(ctx, 10, TOTAL, "Discord announcement", () => {
    const path = ctx.discordOutPath ?? `/tmp/release-discord-${prodVersion}.md`;
    if (fileNonEmpty(path)) {
      info("");
      process.stdout.write(
        `  ${chalk.bold(`── Discord message (paste into ${DISCORD_CHANNEL}) ──`)}\n\n`,
      );
      const body = readFileSync(path, "utf8");
      for (const line of body.split("\n")) {
        process.stdout.write(`  ${line}\n`);
      }
      info("");
      process.stdout.write(`  ${chalk.bold("── end ──")}\n`);
      info("");
      info(`Also saved at: ${path}`);
      if (ctx.dryRun) {
        info(
          chalk.yellow(
            "(dry-run — nothing was actually published; you can preview the message above.)",
          ),
        );
      }
    } else {
      warn(`No Discord message file found at ${path}.`);
      info(
        `Open ${SKILL_PATH} and craft one manually following 'Step 7 — Generate the Discord announcement'.`,
      );
    }
  });

  info("");
  ok("Production flow complete. 🎉");
}

function refreshProdTarget(
  ctx: ReleaseContext,
  stagingBranch: string,
  prodBranch: string,
  prodVersion: string,
  mode: ProdMode,
  dryInput: "true" | "false" | "?",
): void {
  const dryLabel = dryInput === "?" ? "?" : dryInput;
  const scriptDry = ctx.dryRun ? " | script: --dry-run" : "";
  const prod =
    prodBranch ||
    (prodVersion ? `release/production/${prodVersion}` : "(pending)");
  const staging = stagingBranch || "(pending)";
  ctx.targetSummary = `promoting ${staging} → ${prod} | mode=${mode} | workflow dry_run=${dryLabel}${scriptDry}`;
}

function fileNonEmpty(p: string): boolean {
  if (!existsSync(p)) return false;
  try {
    return statSync(p).size > 0;
  } catch {
    return false;
  }
}

async function runDiffPager(repoRoot: string): Promise<void> {
  const { spawn } = await import("node:child_process");
  const pagerCmd = process.env.PAGER || "less";

  const diff = spawn(
    "git",
    ["--no-pager", "diff", "--", join(repoRoot, RELEASE_NOTES_FILE)],
    { stdio: ["ignore", "pipe", "inherit"] },
  );

  const pager = spawn(pagerCmd, [], { stdio: ["pipe", "inherit", "inherit"] });

  await new Promise<void>((resolve) => {
    pager.on("error", () => {
      diff.stdout.pipe(process.stdout);
      diff.once("close", () => resolve());
    });
    pager.on("close", () => resolve());
    diff.stdout.pipe(pager.stdin);
  });
}
