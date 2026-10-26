import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProject } from "./create-project.js";
import {
  commitInitialProject,
  INITIAL_COMMIT_MESSAGE,
} from "./initial-commit.js";

const originalCwd = process.cwd();
const originalEnv = { ...process.env };
let root: string;

function git(cwd: string, args: string[]) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

// Points git at a global config this test controls.
function useGitIdentity(identity: { name?: string; email?: string }) {
  const lines = ["[init]", "\tdefaultBranch = main", "[user]"];
  if (identity.name) lines.push(`\tname = ${identity.name}`);
  if (identity.email) lines.push(`\temail = ${identity.email}`);
  const configPath = join(root, "gitconfig");
  writeFileSync(configPath, lines.join("\n") + "\n");
  process.env.GIT_CONFIG_GLOBAL = configPath;
}

function writeCloneSource(dir: string) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "template", type: "module" }, null, 2),
  );
  writeFileSync(join(dir, "powerhouse.config.json"), "{}\n");
  writeFileSync(join(dir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  writeFileSync(join(dir, ".gitignore"), "node_modules\n");
  mkdirSync(join(dir, "node_modules", "dep"), { recursive: true });
  writeFileSync(join(dir, "node_modules", "dep", "index.js"), "");
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ph-initial-commit-"));
  process.env.GIT_CONFIG_NOSYSTEM = "1";
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("GIT_AUTHOR_") || key.startsWith("GIT_COMMITTER_")) {
      delete process.env[key];
    }
  }
});

afterEach(() => {
  process.chdir(originalCwd);
  process.env = { ...originalEnv };
  rmSync(root, { recursive: true, force: true });
});

describe("commitInitialProject", () => {
  it("commits every file that is not ignored", () => {
    useGitIdentity({ name: "Ada", email: "ada@example.com" });
    const dir = join(root, "project");
    writeCloneSource(dir);
    git(dir, ["init", "--quiet"]);

    expect(commitInitialProject(dir)).toEqual({ committed: true });
    expect(git(dir, ["log", "--format=%s"])).toBe(INITIAL_COMMIT_MESSAGE);
    expect(git(dir, ["status", "--porcelain"])).toBe("");
    expect(git(dir, ["ls-files"]).split("\n")).not.toContain(
      "node_modules/dep/index.js",
    );
  });

  it("skips the commit and says why when git has no identity", () => {
    useGitIdentity({ name: "Ada" });
    const dir = join(root, "project");
    writeCloneSource(dir);
    git(dir, ["init", "--quiet"]);

    expect(commitInitialProject(dir)).toEqual({
      committed: false,
      reason: "git has no user.email configured",
    });
    expect(git(dir, ["status", "--porcelain"])).not.toBe("");
  });
});

describe("createProject --clone", () => {
  it("commits the cloned project in its new repository", async () => {
    useGitIdentity({ name: "Ada", email: "ada@example.com" });
    writeCloneSource(join(root, "template"));
    process.chdir(root);

    const result = await createProject({
      name: "fresh",
      packageManager: "pnpm",
      clone: "template",
      skipInstall: true,
    });

    const dir = join(root, "fresh");
    expect(result.initialCommit).toEqual({ committed: true });
    expect(git(dir, ["log", "--format=%s"])).toBe(INITIAL_COMMIT_MESSAGE);
    expect(git(dir, ["status", "--porcelain"])).toBe("");
  });

  it("makes no repository or commit with skipGitInit", async () => {
    useGitIdentity({ name: "Ada", email: "ada@example.com" });
    writeCloneSource(join(root, "template"));
    process.chdir(root);

    const result = await createProject({
      name: "fresh",
      packageManager: "pnpm",
      clone: "template",
      skipInstall: true,
      skipGitInit: true,
    });

    expect(result.initialCommit).toBeUndefined();
  });
});
