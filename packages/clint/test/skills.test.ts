import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { readSkills } from "../src/core/skills.js";

describe("readSkills", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skills-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function createSkill(
    sourceDir: string,
    name: string,
    description: string,
  ): void {
    const skillDir = path.join(sourceDir, name);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      `---\nname: ${name}\ndescription: "${description}"\nmetadata:\n  version: "1.0.0"\n---\n\nSkill content here.\n`,
    );
  }

  it("reads skill names and descriptions from SKILL.md frontmatter", () => {
    const source = path.join(tmpDir, "skills");
    createSkill(source, "document-modeling", "Design document model schemas");
    createSkill(source, "fusion-development", "Build Fusion UI pages");

    const skills = readSkills([source]);
    expect(skills).toMatchObject([
      {
        name: "document-modeling",
        description: "Design document model schemas",
      },
      { name: "fusion-development", description: "Build Fusion UI pages" },
    ]);
    expect(skills[0]!.skillMdPath).toBe(
      path.join(source, "document-modeling", "SKILL.md"),
    );
    expect(skills[1]!.skillMdPath).toBe(
      path.join(source, "fusion-development", "SKILL.md"),
    );
  });

  it("returns sorted results", () => {
    const source = path.join(tmpDir, "skills");
    createSkill(source, "zzz-last", "Last skill");
    createSkill(source, "aaa-first", "First skill");

    const skills = readSkills([source]);
    expect(skills[0]!.name).toBe("aaa-first");
    expect(skills[1]!.name).toBe("zzz-last");
  });

  it("returns empty array when no sources exist", () => {
    const skills = readSkills(["/nonexistent/path"]);
    expect(skills).toEqual([]);
  });

  it("returns empty array when source has no skill dirs", () => {
    const source = path.join(tmpDir, "empty");
    fs.mkdirSync(source, { recursive: true });

    const skills = readSkills([source]);
    expect(skills).toEqual([]);
  });

  it("skips directories without SKILL.md", () => {
    const source = path.join(tmpDir, "skills");
    createSkill(source, "valid-skill", "Has a SKILL.md");
    fs.mkdirSync(path.join(source, "no-skill-md"), { recursive: true });

    const skills = readSkills([source]);
    expect(skills).toHaveLength(1);
    expect(skills[0]!.name).toBe("valid-skill");
  });

  it("deduplicates across multiple sources (first wins)", () => {
    const source1 = path.join(tmpDir, "source1");
    const source2 = path.join(tmpDir, "source2");
    createSkill(source1, "my-skill", "From source 1");
    createSkill(source2, "my-skill", "From source 2");

    const skills = readSkills([source1, source2]);
    expect(skills).toHaveLength(1);
    expect(skills[0]!.description).toBe("From source 1");
  });

  it("invokes onWarn when a skill name appears in multiple sources", () => {
    const tpl = path.join(tmpDir, "skills-tpl");
    const ext = path.join(tmpDir, "skills-ext");
    createSkill(tpl, "playwright-cli", "From tpl");
    createSkill(ext, "playwright-cli", "From ext");
    createSkill(ext, "unique-skill", "Only here");

    const warnings: string[] = [];
    const skills = readSkills([tpl, ext], (msg) => warnings.push(msg));

    expect(skills.map((s) => s.name).sort()).toEqual([
      "playwright-cli",
      "unique-skill",
    ]);
    // tpl wins
    expect(skills.find((s) => s.name === "playwright-cli")!.description).toBe(
      "From tpl",
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("playwright-cli");
    expect(warnings[0]).toContain(tpl);
    expect(warnings[0]).toContain(ext);
  });

  it("does not invoke onWarn when there are no collisions", () => {
    const tpl = path.join(tmpDir, "skills-tpl");
    const ext = path.join(tmpDir, "skills-ext");
    createSkill(tpl, "tpl-only", "From tpl");
    createSkill(ext, "ext-only", "From ext");

    const warnings: string[] = [];
    readSkills([tpl, ext], (msg) => warnings.push(msg));
    expect(warnings).toEqual([]);
  });

  it("handles SKILL.md without frontmatter gracefully", () => {
    const source = path.join(tmpDir, "skills");
    const skillDir = path.join(source, "broken");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), "No frontmatter here.\n");

    const skills = readSkills([source]);
    expect(skills).toEqual([]);
  });

  it("handles description without quotes", () => {
    const source = path.join(tmpDir, "skills");
    const skillDir = path.join(source, "plain");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      "---\nname: plain\ndescription: Unquoted description\n---\n\nContent.\n",
    );

    const skills = readSkills([source]);
    expect(skills).toMatchObject([
      { name: "plain", description: "Unquoted description" },
    ]);
  });

  it("detects .cli-docs.md alongside SKILL.md", () => {
    const source = path.join(tmpDir, "skills");
    createSkill(source, "documented-skill", "Has CLI docs");
    fs.writeFileSync(
      path.join(source, "documented-skill", ".cli-docs.md"),
      "# Usage\n\nRun this skill to do things.\n",
    );

    const skills = readSkills([source]);
    expect(skills).toHaveLength(1);
    expect(skills[0]!.cliDocsPath).toBe(
      path.join(source, "documented-skill", ".cli-docs.md"),
    );
  });

  it("omits cliDocsPath when .cli-docs.md is absent", () => {
    const source = path.join(tmpDir, "skills");
    createSkill(source, "no-docs-skill", "No CLI docs");

    const skills = readSkills([source]);
    expect(skills).toHaveLength(1);
    expect(skills[0]!.cliDocsPath).toBeUndefined();
  });

  it("handles name without description", () => {
    const source = path.join(tmpDir, "skills");
    const skillDir = path.join(source, "name-only");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      "---\nname: name-only\n---\n\nContent.\n",
    );

    const skills = readSkills([source]);
    expect(skills).toMatchObject([{ name: "name-only", description: "" }]);
  });
});
