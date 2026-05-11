// Subprocess primitives + git/branch/tag helpers + workspace-state queries.
//
// Subprocess shapes:
//   runLocal     visible local action, prints `$ cmd args`, inherits stdio
//   runCapture   capture stdout for parsing; stderr inherits
//   runQuiet     capture both, log nothing (silent probes)
//   echoSkipped  dry-run stub for NETWORK actions only — no execution
//
// `echoSkipped` is opt-in per call site. Only push and workflow trigger
// branch on ctx.dryRun; checkout / merge / commit / nx release version /
// claude all run even under --dry-run, matching the bash exactly.
//
// Active children are tracked so a top-level signal handler can kill them
// on Ctrl-C (prevents orphan `gh run watch` processes etc).

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { DEFAULT_OWNER_REPO, FatalError } from "./lib.js";
import { echoCommand, echoDryRunSkip } from "./ui.js";

// ---------- subprocess core ------------------------------------------------

export interface RunOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  stdin?: string;
  /** When true, non-zero exit codes return normally instead of throwing. */
  allowFailure?: boolean;
}

export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const activeChildren = new Set<ChildProcess>();

export function killTrackedChildren(signal: NodeJS.Signals = "SIGTERM"): void {
  for (const child of activeChildren) {
    try {
      child.kill(signal);
    } catch {
      // Already exited.
    }
  }
}

interface SpawnMode {
  stdio: ["pipe" | "ignore", "inherit" | "pipe", "inherit" | "pipe"];
  capture: { stdout: boolean; stderr: boolean };
  echo: boolean;
}

async function spawnAndWait(
  cmd: string,
  args: string[],
  mode: SpawnMode,
  opts: RunOptions,
): Promise<RunResult> {
  if (mode.echo) echoCommand(cmd, args);

  return new Promise((resolve, reject) => {
    const mergedEnv: NodeJS.ProcessEnv = { ...process.env };
    if (opts.env) {
      for (const [k, v] of Object.entries(opts.env)) {
        if (v === undefined) delete mergedEnv[k];
        else mergedEnv[k] = v;
      }
    }

    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: mergedEnv,
      stdio: mode.stdio,
    });
    activeChildren.add(child);

    let stdout = "";
    let stderr = "";

    if (mode.capture.stdout && child.stdout) {
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });
    }
    if (mode.capture.stderr && child.stderr) {
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
    }

    if (opts.stdin !== undefined && child.stdin) {
      child.stdin.end(opts.stdin);
    }

    child.on("error", (e: NodeJS.ErrnoException) => {
      activeChildren.delete(child);
      if (e.code === "ENOENT") {
        reject(new FatalError(`Command not found: ${cmd}`));
      } else {
        reject(e);
      }
    });

    child.on("close", (code, signal) => {
      activeChildren.delete(child);
      const exitCode = code ?? (signal ? 128 : 1);
      if (exitCode !== 0 && !opts.allowFailure) {
        const tail = stderr.trim() || stdout.trim();
        const msg = `\`${cmd} ${args.join(" ")}\` exited with code ${exitCode}${
          tail ? `\n${tail}` : ""
        }`;
        reject(new FatalError(msg));
        return;
      }
      resolve({ exitCode, stdout, stderr });
    });
  });
}

export async function runLocal(
  cmd: string,
  args: string[],
  opts: RunOptions = {},
): Promise<RunResult> {
  return spawnAndWait(
    cmd,
    args,
    {
      stdio: [
        opts.stdin !== undefined ? "pipe" : "ignore",
        "inherit",
        "inherit",
      ],
      capture: { stdout: false, stderr: false },
      echo: true,
    },
    opts,
  );
}

export async function runCapture(
  cmd: string,
  args: string[],
  opts: RunOptions = {},
): Promise<RunResult> {
  return spawnAndWait(
    cmd,
    args,
    {
      stdio: [opts.stdin !== undefined ? "pipe" : "ignore", "pipe", "inherit"],
      capture: { stdout: true, stderr: false },
      echo: false,
    },
    opts,
  );
}

export async function runQuiet(
  cmd: string,
  args: string[],
  opts: RunOptions = {},
): Promise<RunResult> {
  return spawnAndWait(
    cmd,
    args,
    {
      stdio: [opts.stdin !== undefined ? "pipe" : "ignore", "pipe", "pipe"],
      capture: { stdout: true, stderr: true },
      echo: false,
    },
    { allowFailure: true, ...opts },
  );
}

export function echoSkipped(cmd: string, args: string[]): void {
  echoDryRunSkip(cmd, args);
}

// ---------- git utilities --------------------------------------------------

export async function chdirToRepoRoot(): Promise<string> {
  const r = await runCapture("git", ["rev-parse", "--show-toplevel"], {
    allowFailure: true,
  });
  if (r.exitCode !== 0) {
    throw new FatalError("Not inside a git repository.");
  }
  const root = r.stdout.trim();
  process.chdir(root);
  return root;
}

export async function currentBranch(): Promise<string> {
  const r = await runCapture("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  return r.stdout.trim();
}

export async function currentHeadShort(): Promise<string> {
  const r = await runCapture("git", ["rev-parse", "--short", "HEAD"]);
  return r.stdout.trim();
}

export async function workingTreeClean(): Promise<boolean> {
  const r = await runCapture("git", ["status", "--porcelain"]);
  return r.stdout.trim() === "";
}

/**
 * Parse "owner/repo" from `git remote get-url origin`. Handles SSH, HTTPS,
 * with/without ".git" suffix and trailing slashes. Falls back to
 * DEFAULT_OWNER_REPO when origin isn't resolvable.
 */
export async function resolveRepoPath(): Promise<string> {
  const r = await runQuiet("git", ["remote", "get-url", "origin"]);
  if (r.exitCode !== 0) return DEFAULT_OWNER_REPO;
  const url = r.stdout.trim();
  const m = url.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?\/?$/);
  if (!m) return DEFAULT_OWNER_REPO;
  return `${m[1]}/${m[2]}`;
}

// ---------- tag queries ----------------------------------------------------

export async function latestProductionTag(): Promise<string> {
  return firstMatchingTag(/^v\d+\.\d+\.\d+$/);
}

export async function latestStagingTag(): Promise<string> {
  return firstMatchingTag(/^v\d+\.\d+\.\d+-staging\.\d+$/);
}

export async function latestDevTag(): Promise<string> {
  return firstMatchingTag(/^v\d+\.\d+\.\d+-dev\.\d+$/);
}

/**
 * Highest staging tag merged into `ref`. When versionPrefix is given
 * (e.g. "6.0.1"), only tags matching ^v<prefix>-staging.N$ count — this
 * keeps tags from other staging lines (merged through main) from leaking
 * into the wrong branch's display.
 */
export async function latestStagingTagOn(
  ref: string,
  versionPrefix?: string,
): Promise<string> {
  const r = await runCapture(
    "git",
    ["tag", "--sort=-v:refname", "--merged", ref],
    { allowFailure: true },
  );
  if (r.exitCode !== 0) return "";

  let re: RegExp;
  if (versionPrefix) {
    const escaped = versionPrefix.replace(/\./g, "\\.");
    re = new RegExp(`^v${escaped}-staging\\.\\d+$`);
  } else {
    re = /^v\d+\.\d+\.\d+-staging\.\d+$/;
  }

  for (const line of r.stdout.split("\n")) {
    const tag = line.trim();
    if (tag && re.test(tag)) return tag;
  }
  return "";
}

async function firstMatchingTag(re: RegExp): Promise<string> {
  const r = await runCapture("git", ["tag", "--sort=-v:refname"], {
    allowFailure: true,
  });
  if (r.exitCode !== 0) return "";
  for (const line of r.stdout.split("\n")) {
    const tag = line.trim();
    if (tag && re.test(tag)) return tag;
  }
  return "";
}

// ---------- branch listings ------------------------------------------------

export async function listOriginStagingBranches(): Promise<string[]> {
  return listOriginBranchesUnder("release/staging/");
}

export async function listOriginProductionBranches(): Promise<string[]> {
  return listOriginBranchesUnder("release/production/");
}

async function listOriginBranchesUnder(prefix: string): Promise<string[]> {
  const r = await runCapture(
    "git",
    [
      "for-each-ref",
      "--sort=-committerdate",
      "--format=%(refname:short)",
      `refs/remotes/origin/${prefix}*`,
    ],
    { allowFailure: true },
  );
  if (r.exitCode !== 0) return [];
  return r.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => (l.startsWith("origin/") ? l.slice("origin/".length) : l));
}

export function branchVersion(branch: string): string {
  const stagingPrefix = "release/staging/";
  const prodPrefix = "release/production/";
  if (branch.startsWith(stagingPrefix))
    return branch.slice(stagingPrefix.length);
  if (branch.startsWith(prodPrefix)) return branch.slice(prodPrefix.length);
  return "";
}

export async function localBranchExists(name: string): Promise<boolean> {
  const r = await runQuiet("git", [
    "show-ref",
    "--verify",
    "--quiet",
    `refs/heads/${name}`,
  ]);
  return r.exitCode === 0;
}

// ---------- push verification ----------------------------------------------

export async function verifyPush(branch: string): Promise<boolean> {
  const localR = await runQuiet("git", ["rev-parse", "HEAD"]);
  if (localR.exitCode !== 0) return false;
  const localSha = localR.stdout.trim();

  const remoteR = await runQuiet("git", [
    "ls-remote",
    "--exit-code",
    "origin",
    branch,
  ]);
  if (remoteR.exitCode !== 0) return false;
  const firstLine = remoteR.stdout.split("\n")[0] ?? "";
  const remoteSha = firstLine.split(/\s+/)[0] ?? "";
  if (!remoteSha) return false;

  return localSha === remoteSha;
}

// ---------- workspace state ------------------------------------------------

/**
 * Read the workspace version from packages/codegen/package.json. Used to
 * show "current main is at X.Y.Z-dev.N" before semver computations.
 */
export function currentWorkspaceVersion(repoRoot: string): string {
  const p = join(repoRoot, "packages", "codegen", "package.json");
  if (!existsSync(p)) return "?";
  try {
    const raw = readFileSync(p, "utf8");
    const json = JSON.parse(raw) as { version?: unknown };
    return typeof json.version === "string" ? json.version : "?";
  } catch {
    return "?";
  }
}

// ---------- merge-conflict checks (staging continue-line) -----------------

/**
 * True if any tracked file still contains git conflict markers
 * (`<<<<<<<`, `=======`, `>>>>>>>` at the start of a line).
 */
export async function hasConflictMarkers(): Promise<boolean> {
  const r = await runCapture(
    "git",
    [
      "-c",
      "color.ui=never",
      "diff",
      "--name-only",
      "-G",
      "^(<<<<<<<|=======|>>>>>>>)",
    ],
    { allowFailure: true },
  );
  return r.stdout.trim().length > 0;
}

export async function unmergedPaths(): Promise<string[]> {
  const r = await runCapture(
    "git",
    ["diff", "--name-only", "--diff-filter=U"],
    { allowFailure: true },
  );
  return r.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

export function mergeInProgress(repoRoot: string): boolean {
  return existsSync(join(repoRoot, ".git", "MERGE_HEAD"));
}

/**
 * Returns the set of unique `"version": "..."` lines across all tracked
 * package.json files. Uses `git grep` so it picks up unstaged writes from
 * `nx release version`.
 */
export async function workspaceVersionsAfterBaseline(): Promise<string[]> {
  const r = await runCapture(
    "git",
    ["grep", "-h", '"version":', "--", "**/package.json"],
    { allowFailure: true },
  );
  const lines = r.stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return [...new Set(lines)];
}
