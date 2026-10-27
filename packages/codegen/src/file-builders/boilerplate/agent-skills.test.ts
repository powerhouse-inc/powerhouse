import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MANAGED_RECORD_PATH, agentsMdBlock } from "./agent-files.js";
import {
  CODEGEN_PACKAGE,
  SKILL_ROOTS,
  codegenSkills,
  managedSkillPaths,
  packageSkills,
  managedAgentPaths,
  skillSource,
  syncPackageSkills,
  syncSkills,
} from "./agent-skills.js";

const temporary: string[] = [];

afterEach(() => {
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeDir() {
  const dir = mkdtempSync(join(tmpdir(), "ph-agent-skills-"));
  temporary.push(dir);
  return dir;
}

function write(dir: string, path: string, contents: string) {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), contents);
}

const read = (dir: string, path: string) =>
  readFileSync(join(dir, path), "utf-8");

const SOURCE = "@powerhousedao/example";

const skillMd = (name: string, body = "Steps.\n", source = SOURCE) =>
  `---\nname: ${name}\ndescription: Does ${name}.\nmetadata:\n  powerhouse-source: "${source}"\n---\n\n${body}`;

/** A package folder that ships the given skills. */
function makePackage(skills: Record<string, string>, version = "1.2.3") {
  const dir = makeDir();
  write(dir, "package.json", JSON.stringify({ name: SOURCE, version }));
  for (const [name, body] of Object.entries(skills)) {
    write(dir, `skills/${name}/SKILL.md`, skillMd(name, body));
    write(dir, `skills/${name}/references/guide.md`, `# ${name} guide\n`);
  }
  return dir;
}

const record = (dir: string) =>
  JSON.parse(read(dir, MANAGED_RECORD_PATH)) as {
    files: string[];
    skills: string[];
  };

describe("syncSkills", () => {
  it("writes a shipped skill to every root, with the package version", async () => {
    const project = makeDir();
    const shipped = packageSkills(makePackage({ editors: "Steps.\n" }));

    const results = await syncSkills(project, shipped, SOURCE);

    for (const root of SKILL_ROOTS) {
      expect(read(project, `${root}/editors/SKILL.md`)).toBe(
        `---\nname: editors\ndescription: Does editors.\nmetadata:\n  powerhouse-source: "${SOURCE}"\n  powerhouse-version: "1.2.3"\n---\n\nSteps.\n`,
      );
      expect(read(project, `${root}/editors/references/guide.md`)).toBe(
        "# editors guide\n",
      );
    }
    expect(results).toEqual([{ path: "skills/editors", action: "written" }]);
    expect(record(project).skills).toEqual(["editors"]);
  });

  it("replaces a changed copy and leaves a current one alone", async () => {
    const project = makeDir();
    await syncSkills(
      project,
      packageSkills(makePackage({ a: "v1\n" })),
      SOURCE,
    );
    write(project, ".claude/skills/a/references/extra.md", "user file\n");

    const shipped = packageSkills(makePackage({ a: "v2\n" }, "1.3.0"));
    expect(await syncSkills(project, shipped, SOURCE)).toEqual([
      { path: "skills/a", action: "replaced" },
    ]);
    for (const root of SKILL_ROOTS) {
      expect(read(project, `${root}/a/SKILL.md`)).toContain("v2\n");
      expect(read(project, `${root}/a/SKILL.md`)).toContain('"1.3.0"');
    }
    expect(
      existsSync(join(project, ".claude/skills/a/references/extra.md")),
    ).toBe(false);

    expect(await syncSkills(project, shipped, SOURCE)).toEqual([
      { path: "skills/a", action: "left alone" },
    ]);
  });

  it("leaves a current copy with CRLF line endings alone, as a Windows checkout has it", async () => {
    const project = makeDir();
    const shipped = packageSkills(makePackage({ a: "x\n" }));
    await syncSkills(project, shipped, SOURCE);
    for (const root of SKILL_ROOTS) {
      for (const file of ["SKILL.md", "references/guide.md"]) {
        const path = `${root}/a/${file}`;
        write(project, path, read(project, path).replace(/\n/g, "\r\n"));
      }
      expect(skillSource(join(project, root, "a"))).toBe(SOURCE);
    }

    expect(await syncSkills(project, shipped, SOURCE)).toEqual([
      { path: "skills/a", action: "left alone" },
    ]);
  });

  it("stamps the version once into a shipped SKILL.md with CRLF line endings", async () => {
    const project = makeDir();
    const pkg = makePackage({ a: "x\n" });
    const skillFile = join(pkg, "skills/a/SKILL.md");
    writeFileSync(
      skillFile,
      readFileSync(skillFile, "utf-8")
        .replace('"\n---', '"\n  powerhouse-version: "0.0.1"\n---')
        .replace(/\n/g, "\r\n"),
    );

    await syncSkills(project, packageSkills(pkg), SOURCE);

    expect(read(project, ".agents/skills/a/SKILL.md")).toBe(
      `---\nname: a\ndescription: Does a.\nmetadata:\n  powerhouse-source: "${SOURCE}"\n  powerhouse-version: "1.2.3"\n---\n\nx\n`,
    );
  });

  it("writes the copy missing from one root", async () => {
    const project = makeDir();
    const shipped = packageSkills(makePackage({ a: "x\n" }));
    await syncSkills(project, shipped, SOURCE);
    rmSync(join(project, ".agents/skills/a"), { recursive: true });

    await syncSkills(project, shipped, SOURCE);

    expect(existsSync(join(project, ".agents/skills/a/SKILL.md"))).toBe(true);
  });

  it("leaves a skill the user deleted from both roots deleted", async () => {
    const project = makeDir();
    const shipped = packageSkills(makePackage({ a: "x\n" }));
    await syncSkills(project, shipped, SOURCE);
    for (const root of SKILL_ROOTS) {
      rmSync(join(project, root, "a"), { recursive: true });
    }

    expect(await syncSkills(project, shipped, SOURCE)).toEqual([
      { path: "skills/a", action: "kept deleted" },
    ]);
    for (const root of SKILL_ROOTS) {
      expect(existsSync(join(project, root, "a"))).toBe(false);
    }
  });

  it("leaves the project's own skill of the same name", async () => {
    const project = makeDir();
    const own = "---\nname: a\ndescription: Mine.\n---\n\nMine.\n";
    write(project, ".claude/skills/a/SKILL.md", own);

    const results = await syncSkills(
      project,
      packageSkills(makePackage({ a: "x\n" })),
      SOURCE,
    );

    expect(results).toEqual([{ path: "skills/a", action: "left alone" }]);
    expect(read(project, ".claude/skills/a/SKILL.md")).toBe(own);
    expect(existsSync(join(project, ".agents/skills/a"))).toBe(false);
  });

  it("removes a skill the package no longer ships, and only that package's", async () => {
    const project = makeDir();
    await syncSkills(
      project,
      packageSkills(makePackage({ old: "x\n", kept: "y\n" })),
      SOURCE,
    );
    write(
      project,
      ".claude/skills/other/SKILL.md",
      skillMd("other", "z\n", "@powerhousedao/connect"),
    );

    const results = await syncSkills(
      project,
      packageSkills(makePackage({ kept: "y\n" })),
      SOURCE,
    );

    expect(results).toContainEqual({ path: "skills/old", action: "removed" });
    for (const root of SKILL_ROOTS) {
      expect(existsSync(join(project, root, "old"))).toBe(false);
      expect(existsSync(join(project, root, "kept"))).toBe(true);
    }
    expect(existsSync(join(project, ".claude/skills/other/SKILL.md"))).toBe(
      true,
    );
    expect(record(project).skills).toEqual(["kept"]);
  });

  it("lists the folders it may write or delete", async () => {
    const project = makeDir();
    await syncSkills(
      project,
      packageSkills(makePackage({ old: "x\n" })),
      SOURCE,
    );
    write(project, ".claude/skills/mine/SKILL.md", "---\nname: mine\n---\n");

    const paths = managedSkillPaths(
      project,
      packageSkills(makePackage({ new: "y\n" })),
      SOURCE,
    );

    expect(paths.sort()).toEqual(
      [
        join(".agents/skills", "new"),
        join(".agents/skills", "old"),
        join(".claude/skills", "new"),
        join(".claude/skills", "old"),
      ].sort(),
    );
  });
});

describe("syncPackageSkills", () => {
  const CONNECT = "@powerhousedao/connect";

  /** A project whose node_modules holds the given packages and their skills. */
  function makeInstalledProject(packages: Record<string, string[]>) {
    const project = makeDir();
    write(
      project,
      "package.json",
      JSON.stringify({
        name: "my-package",
        devDependencies: Object.fromEntries(
          Object.keys(packages).map((name) => [name, "1.0.0"]),
        ),
      }),
    );
    for (const [name, skills] of Object.entries(packages)) {
      const dir = `node_modules/${name}`;
      write(
        project,
        `${dir}/package.json`,
        JSON.stringify({ name, version: "2.0.0" }),
      );
      for (const skill of skills) {
        write(
          project,
          `${dir}/skills/${skill}/SKILL.md`,
          skillMd(skill, "x\n", name),
        );
      }
    }
    return project;
  }

  it("installs the skills an installed package ships under its own name", async () => {
    const project = makeInstalledProject({ [CONNECT]: ["customize-connect"] });
    // A package whose skill folder names another source is not a Powerhouse
    // package shipping skills.
    write(
      project,
      "node_modules/other-lib/skills/x/SKILL.md",
      skillMd("x", "x\n", CONNECT),
    );
    write(
      project,
      "node_modules/other-lib/package.json",
      JSON.stringify({ name: "other-lib", version: "1.0.0" }),
    );

    const results = await syncPackageSkills(project);

    expect(results).toEqual([
      { path: "skills/customize-connect", action: "written" },
    ]);
    for (const root of SKILL_ROOTS) {
      expect(read(project, `${root}/customize-connect/SKILL.md`)).toContain(
        'powerhouse-version: "2.0.0"',
      );
      expect(existsSync(join(project, root, "x"))).toBe(false);
    }
  });

  it("removes a package's skills once the package is uninstalled", async () => {
    const project = makeInstalledProject({ [CONNECT]: ["customize-connect"] });
    await syncPackageSkills(project);
    rmSync(join(project, "node_modules", CONNECT), { recursive: true });

    expect(await syncPackageSkills(project)).toEqual([
      { path: "skills/customize-connect", action: "removed" },
    ]);
    for (const root of SKILL_ROOTS) {
      expect(existsSync(join(project, root, "customize-connect"))).toBe(false);
    }
  });

  it("leaves codegen's skills to the codegen that runs", async () => {
    const project = makeInstalledProject({ [CODEGEN_PACKAGE]: ["stale"] });

    expect(await syncPackageSkills(project)).toEqual([]);
    expect(existsSync(join(project, ".agents/skills/stale"))).toBe(false);
  });

  it("names the package skill folders among the paths migrate checks", () => {
    const project = makeInstalledProject({ [CONNECT]: ["customize-connect"] });

    expect(managedAgentPaths(project)).toEqual(
      expect.arrayContaining([
        join(".agents/skills", "customize-connect"),
        join(".claude/skills", "customize-connect"),
        "AGENTS.md",
      ]),
    );
  });
});

describe("codegen's shipped skills", () => {
  const skills = codegenSkills();

  it("are the document-models, editors and processors-subgraphs skills", () => {
    expect(skills.map(({ name }) => name).sort()).toEqual([
      "powerhouse-document-models",
      "powerhouse-editors",
      "powerhouse-processors-subgraphs",
    ]);
  });

  it.each(skills.map((skill) => [skill.name, skill] as const))(
    "%s has valid frontmatter, fits the size limits and links only inside its folder",
    (name, skill) => {
      const skillFile = read(skill.dir, "SKILL.md");
      // A Windows checkout has CRLF line endings.
      const frontmatter =
        /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(skillFile)?.[1] ?? "";
      expect(frontmatter).toMatch(new RegExp(`^name: ${name}$`, "m"));
      const description = /^description: (.+)$/m.exec(frontmatter)?.[1] ?? "";
      expect(description.length).toBeGreaterThan(0);
      expect(description.length).toBeLessThanOrEqual(1024);
      expect(skillSource(skill.dir)).toBe(CODEGEN_PACKAGE);
      expect(skillFile.split(/\r?\n/).length).toBeLessThan(500);

      const files = readdirSync(skill.dir, { recursive: true })
        .map(String)
        .filter((file) => file.endsWith(".md"));
      for (const file of files) {
        const text = read(skill.dir, file);
        for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
          if (/^[a-z]+:/.test(target) || target.startsWith("#")) continue;
          const path = resolve(skill.dir, dirname(file), target.split("#")[0]);
          expect(path.startsWith(skill.dir), `${file} → ${target}`).toBe(true);
          expect(existsSync(path), `${file} → ${target}`).toBe(true);
        }
        if (file !== "SKILL.md" && text.split("\n").length > 100) {
          expect(
            text.slice(0, 1500),
            `${file} needs a table of contents`,
          ).toMatch(/contents/i);
        }
      }
    },
  );
});

describe("AGENTS.md's managed block", () => {
  it("is at most 8 KB", () => {
    expect(Buffer.byteLength(agentsMdBlock())).toBeLessThanOrEqual(8 * 1024);
  });
});
