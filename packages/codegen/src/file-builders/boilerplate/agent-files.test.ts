import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeTemplate } from "templates";
import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "../../codegen/migrate.js";
import {
  AGENTS_BEGIN_MARKER,
  AGENTS_END_MARKER,
  AGENTS_MD_REPLACED_NOTICE,
  CLAUDE_MD_REPLACED_NOTICE,
  MANAGED_RECORD_PATH,
  agentsMdBlock,
  agentsMdFile,
  ignoredAgentFiles,
  uncommittedAgentFiles,
  writeAgentInstructionFiles,
} from "./agent-files.js";

const temporary: string[] = [];

afterEach(() => {
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeProject() {
  const dir = mkdtempSync(join(tmpdir(), "ph-agent-files-"));
  temporary.push(dir);
  return dir;
}

const read = (dir: string, path: string) =>
  readFileSync(join(dir, path), "utf-8");

function write(dir: string, path: string, contents: string) {
  mkdirSync(join(dir, path, ".."), { recursive: true });
  writeFileSync(join(dir, path), contents);
}

const record = (dir: string) =>
  JSON.parse(read(dir, MANAGED_RECORD_PATH)) as unknown;

function git(dir: string, ...args: string[]) {
  execFileSync("git", args, { cwd: dir, stdio: "ignore" });
}

function gitProject() {
  const dir = makeProject();
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "user.name", "test");
  return dir;
}

function commitAll(dir: string) {
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "init");
}

describe("AGENTS.md", () => {
  it("is written with the managed block and a notes section", async () => {
    const dir = makeProject();

    const results = await writeAgentInstructionFiles(dir);

    expect(read(dir, "AGENTS.md")).toBe(agentsMdFile());
    expect(read(dir, "AGENTS.md")).toMatch(/^<!-- powerhouse:begin/);
    expect(read(dir, "AGENTS.md")).toMatch(/## Project notes\n$/);
    expect(results).toContainEqual({ path: "AGENTS.md", action: "written" });
    expect(record(dir)).toEqual({
      files: ["AGENTS.md", "CLAUDE.md"],
      skills: [],
    });
  });

  it("gets a new block between its markers; the notes stay", async () => {
    const dir = makeProject();
    const notes = "\n\n## Project notes\n\nDeploy with `make ship`.\n";
    write(
      dir,
      "AGENTS.md",
      `${AGENTS_BEGIN_MARKER}\nold guidance\n${AGENTS_END_MARKER}${notes}`,
    );

    const results = await writeAgentInstructionFiles(dir);

    expect(read(dir, "AGENTS.md")).toBe(`${agentsMdBlock()}${notes}`);
    // The notes stayed, so there is nothing to tell.
    expect(results.find(({ path }) => path === "AGENTS.md")).toStrictEqual({
      path: "AGENTS.md",
      action: "replaced",
    });
  });

  it("finds a begin marker of another wording", async () => {
    const dir = makeProject();
    write(
      dir,
      "AGENTS.md",
      `<!-- powerhouse:begin (older wording) -->\nold\n${AGENTS_END_MARKER}\n\nmine\n`,
    );

    await writeAgentInstructionFiles(dir);

    expect(read(dir, "AGENTS.md")).toBe(`${agentsMdBlock()}\n\nmine\n`);
  });

  it("is left alone when its block is current", async () => {
    const dir = makeProject();
    write(dir, "AGENTS.md", `${agentsMdBlock()}\n\nmine\n`);

    const results = await writeAgentInstructionFiles(dir);

    expect(read(dir, "AGENTS.md")).toBe(`${agentsMdBlock()}\n\nmine\n`);
    expect(results).toContainEqual({ path: "AGENTS.md", action: "left alone" });
  });

  it("is replaced whole when it has no markers", async () => {
    const dir = makeProject();
    write(dir, "AGENTS.md", "# Old guidance\n\nMy own line.\n");

    const results = await writeAgentInstructionFiles(dir);

    expect(read(dir, "AGENTS.md")).toBe(agentsMdFile());
    expect(results).toContainEqual({
      path: "AGENTS.md",
      action: "replaced",
      notice: AGENTS_MD_REPLACED_NOTICE,
    });
  });

  it("stays deleted once the record lists it", async () => {
    const dir = makeProject();
    await writeAgentInstructionFiles(dir);
    rmSync(join(dir, "AGENTS.md"));

    const results = await writeAgentInstructionFiles(dir);

    expect(existsSync(join(dir, "AGENTS.md"))).toBe(false);
    expect(results).toContainEqual({
      path: "AGENTS.md",
      action: "kept deleted",
    });
  });
});

describe("CLAUDE.md", () => {
  it("is written as the import of AGENTS.md", async () => {
    const dir = makeProject();

    await writeAgentInstructionFiles(dir);

    expect(read(dir, "CLAUDE.md")).toBe(claudeTemplate.trimStart());
    expect(read(dir, "CLAUDE.md")).toMatch(/^@AGENTS\.md\n/);
  });

  it("is left alone once it starts with the import", async () => {
    const dir = makeProject();
    const own = "@AGENTS.md\n\n## Mine\n\n- Use the staging switchboard.\n";
    write(dir, "CLAUDE.md", own);

    const results = await writeAgentInstructionFiles(dir);

    expect(read(dir, "CLAUDE.md")).toBe(own);
    expect(results).toContainEqual({ path: "CLAUDE.md", action: "left alone" });
  });

  it("replaces the old full copy", async () => {
    const dir = makeProject();
    write(dir, "CLAUDE.md", "# Powerhouse Document Models Assistant\n...\n");

    const results = await writeAgentInstructionFiles(dir);

    expect(read(dir, "CLAUDE.md")).toBe(claudeTemplate.trimStart());
    expect(results).toContainEqual({
      path: "CLAUDE.md",
      action: "replaced",
      notice: CLAUDE_MD_REPLACED_NOTICE,
    });
  });

  it("stays deleted once the record lists it; AGENTS.md still updates", async () => {
    const dir = makeProject();
    await writeAgentInstructionFiles(dir);
    rmSync(join(dir, "CLAUDE.md"));
    write(dir, "AGENTS.md", "# Old\n");

    await writeAgentInstructionFiles(dir);

    expect(existsSync(join(dir, "CLAUDE.md"))).toBe(false);
    expect(read(dir, "AGENTS.md")).toBe(agentsMdFile());
    expect(record(dir)).toEqual({
      files: ["AGENTS.md", "CLAUDE.md"],
      skills: [],
    });
  });

  it("is written again when the record does not list it", async () => {
    const dir = makeProject();
    write(dir, MANAGED_RECORD_PATH, '{ "files": ["AGENTS.md"], "skills": [] }');

    const results = await writeAgentInstructionFiles(dir);

    expect(results).toContainEqual({ path: "CLAUDE.md", action: "written" });
    expect(record(dir)).toEqual({
      files: ["AGENTS.md", "CLAUDE.md"],
      skills: [],
    });
  });
});

describe("uncommitted agent files", () => {
  it("lists modified, staged and untracked agent files only", () => {
    const dir = gitProject();
    write(dir, "AGENTS.md", "a\n");
    write(dir, "CLAUDE.md", "c\n");
    write(dir, "README.md", "r\n");
    commitAll(dir);
    write(dir, "AGENTS.md", "changed\n");
    write(dir, "CLAUDE.md", "staged\n");
    git(dir, "add", "CLAUDE.md");
    write(dir, ".claude/settings.json", "{}\n");
    write(dir, "README.md", "not an agent file\n");

    expect(uncommittedAgentFiles(dir)?.sort()).toEqual([
      ".claude/settings.json",
      "AGENTS.md",
      "CLAUDE.md",
    ]);
  });

  it("names the agent files git ignores", () => {
    const dir = gitProject();
    write(dir, ".gitignore", ".claude\n");
    write(dir, ".claude/settings.json", "{}\n");
    commitAll(dir);

    expect(
      ignoredAgentFiles(dir, [".claude/settings.json", "AGENTS.md"]),
    ).toEqual([".claude/settings.json"]);
  });

  it("is empty for a clean work tree and undefined outside git", () => {
    const dir = gitProject();
    write(dir, "AGENTS.md", "a\n");
    commitAll(dir);
    expect(uncommittedAgentFiles(dir)).toEqual([]);
    expect(uncommittedAgentFiles(makeProject())).toBeUndefined();
  });

  it("stop migrate before it writes anything", async () => {
    const dir = gitProject();
    const packageJson = '{ "name": "my-package", "version": "1.0.0" }\n';
    write(dir, "package.json", packageJson);
    write(dir, "AGENTS.md", "# Mine\n");
    commitAll(dir);
    write(dir, "AGENTS.md", "# Mine, edited\n");

    await expect(migrate("latest", dir, { skipInstall: true })).rejects.toThrow(
      /uncommitted changes:\n {2}AGENTS\.md\n/,
    );

    expect(read(dir, "package.json")).toBe(packageJson);
    expect(read(dir, "AGENTS.md")).toBe("# Mine, edited\n");
    expect(existsSync(join(dir, "CLAUDE.md"))).toBe(false);
  });
});
