import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { z } from "zod";
import { installSkills } from "../src/core/init.js";
import { createWorkdirStore } from "../src/core/store.js";
import { defineCommand } from "../src/core/command.js";
import { defineCli } from "../src/core/cli.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "init-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("installSkills", () => {
  it("copies skill folders from the first existing source", () => {
    const store = createWorkdirStore(tmpDir, "testcli");
    const skillsDir = path.join(tmpDir, "skills");

    // Create two skill folders with files
    fs.mkdirSync(path.join(skillsDir, "skill-a"), { recursive: true });
    fs.writeFileSync(path.join(skillsDir, "skill-a", "SKILL.md"), "# Skill A");
    fs.mkdirSync(path.join(skillsDir, "skill-b"), { recursive: true });
    fs.writeFileSync(path.join(skillsDir, "skill-b", "SKILL.md"), "# Skill B");
    fs.writeFileSync(path.join(skillsDir, "skill-b", "extra.txt"), "extra");

    const logs: string[] = [];
    const count = installSkills({
      store,
      skillArtifacts: ["/nonexistent", skillsDir],
      stdout: (msg) => logs.push(msg),
    });

    expect(count).toBe(2);

    // Verify files were copied
    const targetDir = store.getStoreFolder(".mastra/skills");
    expect(fs.existsSync(path.join(targetDir, "skill-a", "SKILL.md"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(targetDir, "skill-b", "SKILL.md"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(targetDir, "skill-b", "extra.txt"))).toBe(
      true,
    );
    expect(
      fs.readFileSync(path.join(targetDir, "skill-a", "SKILL.md"), "utf8"),
    ).toBe("# Skill A");
  });

  it("copies subdirectories recursively (e.g. references/)", () => {
    const store = createWorkdirStore(tmpDir, "testcli");
    const skillsDir = path.join(tmpDir, "skills");

    // Create a skill with a references/ subdirectory
    fs.mkdirSync(path.join(skillsDir, "my-skill", "references"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(skillsDir, "my-skill", "SKILL.md"),
      "# My Skill",
    );
    fs.writeFileSync(
      path.join(skillsDir, "my-skill", "references", "prereqs.md"),
      "# Prerequisites",
    );
    fs.writeFileSync(
      path.join(skillsDir, "my-skill", "references", "steps.md"),
      "# Steps",
    );

    installSkills({
      store,
      skillArtifacts: [skillsDir],
      stdout: () => {},
    });

    const targetDir = store.getStoreFolder(".mastra/skills");
    expect(fs.existsSync(path.join(targetDir, "my-skill", "SKILL.md"))).toBe(
      true,
    );
    expect(
      fs.existsSync(
        path.join(targetDir, "my-skill", "references", "prereqs.md"),
      ),
    ).toBe(true);
    expect(
      fs.readFileSync(
        path.join(targetDir, "my-skill", "references", "steps.md"),
        "utf8",
      ),
    ).toBe("# Steps");
  });

  it("returns 0 when no source directories exist", () => {
    const store = createWorkdirStore(tmpDir, "testcli");
    const logs: string[] = [];
    const count = installSkills({
      store,
      skillArtifacts: ["/nonexistent-a", "/nonexistent-b"],
      stdout: (msg) => logs.push(msg),
    });

    expect(count).toBe(0);
    expect(
      logs.some((l) => l.includes("No skill source directory found")),
    ).toBe(true);
  });

  it("returns 0 when source has no subdirectories", () => {
    const store = createWorkdirStore(tmpDir, "testcli");
    const emptyDir = path.join(tmpDir, "empty-skills");
    fs.mkdirSync(emptyDir, { recursive: true });

    const logs: string[] = [];
    const count = installSkills({
      store,
      skillArtifacts: [emptyDir],
      stdout: (msg) => logs.push(msg),
    });

    expect(count).toBe(0);
    expect(logs.some((l) => l.includes("No skill folders found"))).toBe(true);
  });

  it("clears existing target before copying", () => {
    const store = createWorkdirStore(tmpDir, "testcli");
    const skillsDir = path.join(tmpDir, "skills");

    // Create a skill
    fs.mkdirSync(path.join(skillsDir, "skill-a"), { recursive: true });
    fs.writeFileSync(path.join(skillsDir, "skill-a", "SKILL.md"), "# A");

    // Pre-populate target with stale skill
    const targetDir = store.getStoreFolder(".mastra/skills");
    fs.mkdirSync(path.join(targetDir, "old-skill"), { recursive: true });
    fs.writeFileSync(path.join(targetDir, "old-skill", "SKILL.md"), "# Old");

    installSkills({
      store,
      skillArtifacts: [skillsDir],
      stdout: () => {},
    });

    // Old skill should be gone
    expect(fs.existsSync(path.join(targetDir, "old-skill"))).toBe(false);
    // New skill should be there
    expect(fs.existsSync(path.join(targetDir, "skill-a", "SKILL.md"))).toBe(
      true,
    );
  });

  it("uses first existing source and ignores later ones", () => {
    const store = createWorkdirStore(tmpDir, "testcli");

    const first = path.join(tmpDir, "first");
    const second = path.join(tmpDir, "second");

    fs.mkdirSync(path.join(first, "skill-from-first"), { recursive: true });
    fs.writeFileSync(
      path.join(first, "skill-from-first", "SKILL.md"),
      "# First",
    );

    fs.mkdirSync(path.join(second, "skill-from-second"), { recursive: true });
    fs.writeFileSync(
      path.join(second, "skill-from-second", "SKILL.md"),
      "# Second",
    );

    installSkills({
      store,
      skillArtifacts: [first, second],
      stdout: () => {},
    });

    const targetDir = store.getStoreFolder(".mastra/skills");
    expect(fs.existsSync(path.join(targetDir, "skill-from-first"))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, "skill-from-second"))).toBe(
      false,
    );
  });
});

describe("auto-initialization on first run", () => {
  const dummyCommand = defineCommand({
    id: "ping",
    description: "Ping",
    inputSchema: z.object({}),
    execute: async () => ({ text: "pong" }),
  });

  it("creates store and installs skills when running any command", async () => {
    const skillsDir = path.join(tmpDir, "skills");
    fs.mkdirSync(path.join(skillsDir, "my-skill"), { recursive: true });
    fs.writeFileSync(
      path.join(skillsDir, "my-skill", "SKILL.md"),
      "---\nname: my-skill\ndescription: test\n---\n# My Skill",
    );

    const cli = defineCli({
      name: "testcli",
      version: "1.0.0",
      description: "Test",
      commands: [dummyCommand],
      prompts: { artifacts: [skillsDir] },
    });

    const output: string[] = [];
    await cli.run(["node", "testcli", "ping"], {
      stdout: (msg) => output.push(msg),
      stderr: () => {},
      exit: () => {},
      workdir: tmpDir,
    });

    // Store root should exist
    const store = createWorkdirStore(tmpDir, "testcli");
    expect(fs.existsSync(store.getStoreFolder())).toBe(true);
    // DB folder should exist
    expect(fs.existsSync(store.getStoreFolder(".mastra/db"))).toBe(true);
    // Skill should be installed
    expect(
      fs.existsSync(
        path.join(
          store.getStoreFolder(".mastra/skills"),
          "my-skill",
          "SKILL.md",
        ),
      ),
    ).toBe(true);
    // Command output should be present
    expect(output).toContain("pong");
  });

  it("is silent by default (no init output)", async () => {
    const skillsDir = path.join(tmpDir, "skills");
    fs.mkdirSync(path.join(skillsDir, "my-skill"), { recursive: true });
    fs.writeFileSync(
      path.join(skillsDir, "my-skill", "SKILL.md"),
      "---\nname: my-skill\ndescription: test\n---\n# My Skill",
    );

    const cli = defineCli({
      name: "testcli",
      version: "1.0.0",
      description: "Test",
      commands: [dummyCommand],
      prompts: { artifacts: [skillsDir] },
    });

    const output: string[] = [];
    const errOutput: string[] = [];
    await cli.run(["node", "testcli", "ping"], {
      stdout: (msg) => output.push(msg),
      stderr: (msg) => errOutput.push(msg),
      exit: () => {},
      workdir: tmpDir,
    });

    // No init messages in stdout or stderr
    expect(output.join("\n")).not.toContain("[init]");
    expect(errOutput.join("\n")).not.toContain("[init]");
  });

  it("does not re-initialize when store already exists", async () => {
    const skillsDir = path.join(tmpDir, "skills");
    fs.mkdirSync(path.join(skillsDir, "my-skill"), { recursive: true });
    fs.writeFileSync(
      path.join(skillsDir, "my-skill", "SKILL.md"),
      "---\nname: my-skill\ndescription: test\n---\n# My Skill",
    );

    const cli = defineCli({
      name: "testcli",
      version: "1.0.0",
      description: "Test",
      commands: [dummyCommand],
      prompts: { artifacts: [skillsDir] },
    });

    const runOpts = {
      stdout: () => {},
      stderr: () => {},
      exit: () => {},
      workdir: tmpDir,
    };

    // First run — creates store
    await cli.run(["node", "testcli", "ping"], runOpts);

    // Modify the installed skill to detect re-install
    const store = createWorkdirStore(tmpDir, "testcli");
    const installedSkill = path.join(
      store.getStoreFolder(".mastra/skills"),
      "my-skill",
      "SKILL.md",
    );
    fs.writeFileSync(installedSkill, "# Modified");

    // Second run — should NOT re-install
    await cli.run(["node", "testcli", "ping"], runOpts);

    expect(fs.readFileSync(installedSkill, "utf8")).toBe("# Modified");
  });

  it("does not inject an init command", () => {
    const cli = defineCli({
      name: "testcli",
      version: "1.0.0",
      description: "Test",
      commands: [dummyCommand],
      prompts: { artifacts: ["/some/path"] },
    });

    expect(cli.getCommand("init")).toBeUndefined();
  });
});
