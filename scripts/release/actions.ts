// Shared release actions: gh wrappers, push (with three-way + verification),
// workflow trigger (with three-way + optional tail), askDryRunInput (used by
// every flow's "Run mode" step), and claude-driven release-notes generation
// for production.

import { createWriteStream, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

import {
  AbortError,
  DISCORD_MARKER_END,
  DISCORD_MARKER_START,
  SKILL_PATH,
  WORKFLOW_FILE,
  type ReleaseContext,
} from "./lib.js";
import {
  currentHeadShort,
  echoSkipped,
  runLocal,
  runQuiet,
  verifyPush,
} from "./exec.js";
import {
  chalk,
  confirm,
  info,
  ok,
  pauseForManual,
  readLine,
  targetBox,
  threeWay,
  warn,
} from "./ui.js";

// ---------- gh wrappers --------------------------------------------------

async function ghWorkflowRun(
  branch: string,
  releaseMode: string,
  dryRunInput: string,
): Promise<void> {
  await runLocal("gh", [
    "workflow",
    "run",
    WORKFLOW_FILE,
    "--ref",
    branch,
    "-f",
    `release_mode=${releaseMode}`,
    "-f",
    `dry_run=${dryRunInput}`,
  ]);
}

async function ghLatestRunId(branch: string): Promise<string> {
  const r = await runQuiet("gh", [
    "run",
    "list",
    "-w",
    WORKFLOW_FILE,
    "-b",
    branch,
    "-L",
    "1",
    "--json",
    "databaseId",
    "--jq",
    ".[0].databaseId",
  ]);
  if (r.exitCode !== 0) return "";
  return r.stdout.trim();
}

async function ghLatestRunStatus(branch: string): Promise<string> {
  const r = await runQuiet("gh", [
    "run",
    "list",
    "-w",
    WORKFLOW_FILE,
    "-b",
    branch,
    "-L",
    "1",
    "--json",
    "status,conclusion",
    "--jq",
    '.[0].status + "/" + (.[0].conclusion // "")',
  ]);
  if (r.exitCode !== 0) return "";
  return r.stdout.trim();
}

async function ghRunWatch(runId: string): Promise<number> {
  const r = await runLocal("gh", ["run", "watch", runId, "--exit-status"], {
    allowFailure: true,
  });
  return r.exitCode;
}

// ---------- push ---------------------------------------------------------

export async function doPush(
  ctx: ReleaseContext,
  branch: string,
): Promise<void> {
  for (;;) {
    targetBox(`Push: HEAD → origin/${branch}`);
    const choice = await threeWay({
      ctx,
      scriptLabel: "Script pushes via git push",
      manualLabel: "I'll push manually — show me the command and wait",
      requireGh: false,
    });

    if (choice === "abort") {
      throw new AbortError(ctx.currentStep);
    }

    if (choice === "script") {
      if (ctx.dryRun) {
        echoSkipped("git", ["push", "-u", "origin", branch]);
        return;
      }
      const r = await runLocal("git", ["push", "-u", "origin", branch], {
        allowFailure: true,
      });
      if (r.exitCode !== 0) {
        warn("Push failed. Re-prompting.");
        continue;
      }
      if (!(await verifyPush(branch))) {
        warn("Push verification failed (origin sha != local sha).");
        continue;
      }
      ok(`origin/${branch} is at ${await currentHeadShort()}.`);
      return;
    }

    // manual
    await pauseForManual(`git push -u origin ${branch}`);
    if (ctx.dryRun) {
      info(chalk.dim("(dry-run — skipping verification.)"));
      return;
    }
    if (!(await verifyPush(branch))) {
      warn(`Couldn't verify push — origin/${branch} doesn't match local HEAD.`);
      continue;
    }
    ok(`Verified: origin/${branch} exists at ${await currentHeadShort()}.`);
    return;
  }
}

// ---------- workflow trigger ---------------------------------------------

export async function doTriggerWorkflow(
  ctx: ReleaseContext,
  branch: string,
  releaseMode: string,
  dryRunInput: "true" | "false",
): Promise<void> {
  for (;;) {
    targetBox(
      `branch:       ${branch}`,
      `release_mode: ${releaseMode}`,
      `dry_run:      ${dryRunInput}`,
    );
    const choice = await threeWay({
      ctx,
      scriptLabel: "Script triggers via gh CLI",
      manualLabel: "I'll trigger manually in the GitHub UI",
      requireGh: true,
    });

    if (choice === "abort") {
      throw new AbortError(ctx.currentStep);
    }

    if (choice === "script") {
      if (ctx.dryRun) {
        echoSkipped("gh", [
          "workflow",
          "run",
          WORKFLOW_FILE,
          "--ref",
          branch,
          "-f",
          `release_mode=${releaseMode}`,
          "-f",
          `dry_run=${dryRunInput}`,
        ]);
        return;
      }
      try {
        await ghWorkflowRun(branch, releaseMode, dryRunInput);
      } catch (e) {
        warn(`Workflow trigger failed: ${(e as Error).message}`);
        continue;
      }
      ok("Triggered.");
      await maybeTailRun(ctx, branch);
      return;
    }

    // manual
    printManualTriggerInstructions(ctx, branch, releaseMode, dryRunInput);
    if (ctx.dryRun) {
      info(chalk.dim("(dry-run — skipping verification.)"));
      await pauseEnter("  Press Enter to continue… ");
      return;
    }
    await pauseEnter(
      "  Press Enter once the workflow has been triggered AND watched to completion… ",
    );
    if (ctx.hasGh) {
      info(`Verifying latest run on ${branch}…`);
      const state = await ghLatestRunStatus(branch);
      if (state) {
        info(`Latest run status/conclusion: ${state}`);
      }
    }
    return;
  }
}

async function maybeTailRun(
  ctx: ReleaseContext,
  branch: string,
): Promise<void> {
  if (!(await confirm(ctx, "Tail the run in this terminal?", true))) return;
  await new Promise((r) => setTimeout(r, 3000));
  const runId = await ghLatestRunId(branch);
  if (!runId) {
    warn("Couldn't locate the run id — open the Actions page in your browser.");
    info(
      `https://github.com/${ctx.repoPath}/actions/workflows/${WORKFLOW_FILE}`,
    );
    return;
  }
  info(`Watching run ${runId}…`);
  const code = await ghRunWatch(runId);
  if (code !== 0) {
    warn("Workflow run did not complete successfully.");
    return;
  }
  ok(`Workflow run ${runId} succeeded.`);
}

export function printManualTriggerInstructions(
  ctx: ReleaseContext,
  branch: string,
  releaseMode: string,
  dryRunInput: string,
): void {
  process.stdout.write("\n");
  process.stdout.write(`  ${chalk.bold("Trigger the workflow manually:")}\n\n`);
  process.stdout.write(
    `    1) Open: https://github.com/${ctx.repoPath}/actions/workflows/${WORKFLOW_FILE}\n`,
  );
  process.stdout.write(
    `    2) Click 'Run workflow' (top-right of the runs list).\n`,
  );
  process.stdout.write(`    3) Set:\n`);
  process.stdout.write(`         Use workflow from:  ${branch}\n`);
  process.stdout.write(`         release_mode:       ${releaseMode}\n`);
  process.stdout.write(`         dry_run:            ${dryRunInput}\n`);
  process.stdout.write(`    4) Click the green 'Run workflow' button.\n`);
  process.stdout.write(
    `    5) Watch the run on the Actions page until it finishes.\n\n`,
  );
}

async function pauseEnter(prompt: string): Promise<void> {
  process.stdout.write(prompt);
  await readLine();
}

// ---------- dry-run input (shared across flows) --------------------------

export async function askDryRunInput(
  ctx: ReleaseContext,
  channel: "dev" | "staging" | "production",
): Promise<"true" | "false"> {
  const dry = await confirm(
    ctx,
    "Dry run? (recommended — workflow skips npm publish + git push + tag)",
    true,
  );
  if (dry) return "true";
  warn(`Dry run is OFF — this WILL publish to npm (channel: ${channel}).`);
  if (await confirm(ctx, "Really proceed without dry run?", false)) {
    return "false";
  }
  info("Keeping dry run ON.");
  return "true";
}

// ---------- claude release-notes generation ------------------------------

export interface GenerateNotesOptions {
  ctx: ReleaseContext;
  version: string;
  prevTag: string;
  discordOut: string;
}

export interface GenerateNotesResult {
  extracted: boolean;
  logPath: string;
}

export async function generateNotesWithClaude(
  opts: GenerateNotesOptions,
): Promise<GenerateNotesResult> {
  const { ctx, version, prevTag, discordOut } = opts;

  const tmpDir = mkdtempSync(join(tmpdir(), "release-claude-"));
  const logPath = join(tmpDir, "release.log");
  const logStream = createWriteStream(logPath);

  const prompt = buildClaudePrompt(version, prevTag);

  if (ctx.dryRun) {
    info(
      chalk.yellow("[DRY-RUN]") +
        " would invoke claude --dangerously-skip-permissions --print",
    );
    info(
      chalk.yellow("[DRY-RUN]") +
        " (still running for real because RELEASE-NOTES.md is local — the file changes will be on your working tree only)",
    );
  }

  info("Invoking claude (this may take a couple of minutes)…");

  const buf: string[] = [];
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "claude",
      ["--dangerously-skip-permissions", "--print", prompt],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      process.stdout.write(chunk);
      logStream.write(chunk);
      buf.push(chunk);
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      process.stderr.write(chunk);
      logStream.write(chunk);
    });

    child.on("error", (e) => {
      logStream.end();
      reject(e);
    });
    child.on("close", (code) => {
      logStream.end();
      if (code !== 0) {
        warn(
          `claude exited with a non-zero status (${code}). Check the output above.`,
        );
      }
      resolve();
    });
  });

  const full = buf.join("");
  const escapedStart = escapeRegex(DISCORD_MARKER_START);
  const escapedEnd = escapeRegex(DISCORD_MARKER_END);
  const re = new RegExp(
    `^${escapedStart}\\s*\\n([\\s\\S]*?)\\n${escapedEnd}`,
    "m",
  );
  const m = full.match(re);

  if (!m) {
    warn("Couldn't extract the Discord message from claude's output.");
    warn(
      `Marker-based extraction returned nothing. The full claude log is at: ${logPath}`,
    );
    info(`You can craft the Discord message manually following ${SKILL_PATH}.`);
    return { extracted: false, logPath };
  }

  const body = m[1]!.trimEnd() + "\n";
  writeFileSync(discordOut, body);
  ok(
    `Discord message extracted to ${discordOut} (${Buffer.byteLength(body)} bytes).`,
  );
  ok("claude finished. Inspect RELEASE-NOTES.md in the next step.");
  return { extracted: true, logPath };
}

function buildClaudePrompt(version: string, prevTag: string): string {
  return [
    `Run the /release-notes skill for production version ${version}. The previous production tag is ${prevTag}.`,
    "",
    `After the skill has finished prepending the new section to RELEASE-NOTES.md and printed its normal summary, print the Discord announcement message once more between these EXACT markers so a calling script can extract it programmatically (do not add anything between the markers other than the message body itself, and do not surround it with code fences):`,
    "",
    DISCORD_MARKER_START,
    "<discord message body, the same one the skill printed in the fenced code block above>",
    DISCORD_MARKER_END,
    "",
    "Do not commit, push, or trigger any workflow. The calling script handles those steps.",
  ].join("\n");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function printManualNotesInstructions(
  prevTag: string,
  version: string,
  discordOut: string,
): void {
  info("");
  process.stdout.write(
    `  ${chalk.bold("Update RELEASE-NOTES.md manually:")}\n\n`,
  );
  process.stdout.write(`    1) Review commits in scope:\n`);
  process.stdout.write(
    `         git log ${prevTag}..HEAD --no-merges --pretty=format:"%h %s"\n`,
  );
  process.stdout.write(
    `         git log ${prevTag}..HEAD --name-only --pretty=format:\n\n`,
  );
  process.stdout.write(
    `    2) Cross-reference CHANGELOG.md entries between ${prevTag} and HEAD.\n\n`,
  );
  process.stdout.write(
    `    3) Open RELEASE-NOTES.md and prepend a new section under '# Release Changelog'.\n`,
  );
  process.stdout.write(
    `       Format reference:  RELEASE.md → 'Reference — RELEASE-NOTES.md format conventions'\n`,
  );
  process.stdout.write(`       Full procedure:    ${SKILL_PATH}\n\n`);
  process.stdout.write(
    `    4) Draft the Discord announcement and save it to:\n`,
  );
  process.stdout.write(`         ${discordOut}\n\n`);
  process.stdout.write(
    `       Rules: ≤2000 chars, no markdown headings, bare URLs.\n`,
  );
  process.stdout.write(
    `       Template: see ${SKILL_PATH} → 'Step 7 — Generate the Discord announcement'.\n\n`,
  );
}
