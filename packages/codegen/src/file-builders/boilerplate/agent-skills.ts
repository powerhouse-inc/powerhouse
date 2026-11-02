import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type AgentFileResult,
  MANAGED_AGENT_FILES,
  readManagedRecord,
  writeManagedRecord,
} from "./agent-files.js";

/** Every agent reads one of these; Claude Code reads only `.claude/skills`. */
export const SKILL_ROOTS = [".agents/skills", ".claude/skills"];

export type ShippedSkill = {
  name: string;
  /** The skill folder in the package that ships it. */
  dir: string;
  /** The package name, written to `metadata.powerhouse-source`. */
  source: string;
  version: string;
};

export const CODEGEN_PACKAGE = "@powerhousedao/codegen";

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf-8")) as {
    name?: string;
    version?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
}

function codegenPackageDir() {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (dirname(dir) !== dir) {
    const manifest = join(dir, "package.json");
    if (existsSync(manifest) && readJson(manifest).name === CODEGEN_PACKAGE) {
      return dir;
    }
    dir = dirname(dir);
  }
  throw new Error(`${CODEGEN_PACKAGE}'s package.json was not found.`);
}

/** The skills a package ships in its `skills/` folder. */
export function packageSkills(packageDir: string): ShippedSkill[] {
  const skillsDir = join(packageDir, "skills");
  if (!existsSync(skillsDir)) return [];
  const { name = "", version = "" } = readJson(
    join(packageDir, "package.json"),
  );
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        existsSync(join(skillsDir, entry.name, "SKILL.md")),
    )
    .map((entry) => ({
      name: entry.name,
      dir: join(skillsDir, entry.name),
      source: name,
      version,
    }));
}

export const codegenSkills = () => packageSkills(codegenPackageDir());

/** `metadata.powerhouse-source` of a skill folder's SKILL.md. */
export function skillSource(skillDir: string): string | undefined {
  const skillFile = join(skillDir, "SKILL.md");
  if (!existsSync(skillFile)) return undefined;
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(
    readFileSync(skillFile, "utf-8"),
  )?.[1];
  return frontmatter
    ? /^[ \t]+powerhouse-source:[ \t]*"?([^"\r\n]+?)"?[ \t]*$/m.exec(
        frontmatter,
      )?.[1]
    : undefined;
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)))
    .sort();
}

// A Windows checkout may have CRLF copies; they are the same skill.
const withLf = (text: string) => text.replace(/\r\n/g, "\n");

/** The skill's files as the project gets them: SKILL.md names the version. */
function renderedSkill(skill: ShippedSkill): Map<string, string> {
  const files = new Map<string, string>();
  for (const file of listFiles(skill.dir)) {
    let contents = readFileSync(join(skill.dir, file), "utf-8");
    if (file === "SKILL.md") {
      contents = withLf(contents)
        .replace(/^[ \t]+powerhouse-version:.*\n/m, "")
        .replace(
          /^([ \t]+)powerhouse-source:.*$/m,
          (line, indent: string) =>
            `${line}\n${indent}powerhouse-version: "${skill.version}"`,
        );
    }
    files.set(file, contents);
  }
  return files;
}

function sameTree(dir: string, files: Map<string, string>) {
  if (!existsSync(dir)) return false;
  const existing = listFiles(dir);
  return (
    existing.length === files.size &&
    existing.every((file) => {
      const shipped = files.get(file);
      return (
        shipped !== undefined &&
        withLf(readFileSync(join(dir, file), "utf-8")) === withLf(shipped)
      );
    })
  );
}

function writeTree(dir: string, files: Map<string, string>) {
  rmSync(dir, { recursive: true, force: true });
  for (const [file, contents] of files) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), contents);
  }
}

/** Folders migrate may write or delete for `source`: the shipped skills and
 * the ones it installed before. */
export function managedSkillPaths(
  projectDir: string,
  shipped: readonly ShippedSkill[],
  source: string,
): string[] {
  const paths = new Set<string>();
  for (const root of SKILL_ROOTS) {
    for (const { name } of shipped) paths.add(join(root, name));
    if (!existsSync(join(projectDir, root))) continue;
    for (const entry of readdirSync(join(projectDir, root))) {
      if (skillSource(join(projectDir, root, entry)) === source) {
        paths.add(join(root, entry));
      }
    }
  }
  return [...paths];
}

/** Brings the project's copies of `source`'s skills in line with `shipped`,
 * in every skill root. */
export async function syncSkills(
  projectDir: string,
  shipped: readonly ShippedSkill[],
  source: string,
): Promise<AgentFileResult[]> {
  const record = readManagedRecord(projectDir) ?? { files: [], skills: [] };
  const installed = new Set(record.skills);
  const results: AgentFileResult[] = [];
  for (const skill of shipped) {
    const dirs = SKILL_ROOTS.map((root) => join(projectDir, root, skill.name));
    const path = `skills/${skill.name}`;
    const foreign = dirs.filter(
      (dir) => existsSync(dir) && skillSource(dir) !== source,
    );
    if (foreign.length > 0) {
      console.warn(
        `⚠ ${relative(projectDir, foreign[0])} is the project's own skill; ${source}'s ${skill.name} skill was not installed.`,
      );
      results.push({ path, action: "left alone" });
      continue;
    }
    const present = dirs.filter((dir) => existsSync(dir));
    if (present.length === 0 && installed.has(skill.name)) {
      results.push({ path, action: "kept deleted" });
      continue;
    }
    const files = renderedSkill(skill);
    const stale = dirs.filter((dir) => !sameTree(dir, files));
    for (const dir of stale) writeTree(dir, files);
    installed.add(skill.name);
    results.push({
      path,
      action:
        stale.length === 0
          ? "left alone"
          : present.length === 0
            ? "written"
            : "replaced",
    });
  }
  const shippedNames = new Set(shipped.map(({ name }) => name));
  for (const dir of managedSkillPaths(projectDir, [], source)) {
    const name = basename(dir);
    if (shippedNames.has(name)) continue;
    rmSync(join(projectDir, dir), { recursive: true, force: true });
    installed.delete(name);
    if (!results.some((result) => result.path === `skills/${name}`)) {
      results.push({ path: `skills/${name}`, action: "removed" });
    }
  }
  await writeManagedRecord(projectDir, { ...record, skills: [...installed] });
  return results;
}

/** The installed dependencies that ship skills naming themselves as source,
 * and the skills each ships. */
function installedPackageSkills(projectDir: string) {
  const manifest = join(projectDir, "package.json");
  const { dependencies = {}, devDependencies = {} } = existsSync(manifest)
    ? readJson(manifest)
    : {};
  const packages = new Map<string, ShippedSkill[]>();
  for (const name of Object.keys({ ...dependencies, ...devDependencies })) {
    if (name === CODEGEN_PACKAGE) continue;
    const packageDir = join(projectDir, "node_modules", name);
    if (!existsSync(join(packageDir, "package.json"))) continue;
    const skills = packageSkills(packageDir).filter(
      (skill) => skillSource(skill.dir) === name,
    );
    if (skills.length > 0) packages.set(name, skills);
  }
  return packages;
}

/** The sources of the skill folders codegen installed in the project. */
function installedSources(projectDir: string) {
  const sources = new Set<string>();
  for (const root of SKILL_ROOTS) {
    if (!existsSync(join(projectDir, root))) continue;
    for (const entry of readdirSync(join(projectDir, root))) {
      const source = skillSource(join(projectDir, root, entry));
      if (source) sources.add(source);
    }
  }
  return sources;
}

/** Syncs the skills of the project's installed dependencies; removes those of
 * packages no longer installed. Run after an install. */
export async function syncPackageSkills(
  projectDir: string,
): Promise<AgentFileResult[]> {
  const packages = installedPackageSkills(projectDir);
  const sources = new Set([
    ...installedSources(projectDir),
    ...packages.keys(),
  ]);
  sources.delete(CODEGEN_PACKAGE);
  const results: AgentFileResult[] = [];
  for (const source of sources) {
    results.push(
      ...(await syncSkills(projectDir, packages.get(source) ?? [], source)),
    );
  }
  return results;
}

/** Every path a migrate with this codegen writes agent guidance to. */
export function managedAgentPaths(projectDir: string) {
  const paths = new Set([
    ...MANAGED_AGENT_FILES,
    ...managedSkillPaths(projectDir, codegenSkills(), CODEGEN_PACKAGE),
  ]);
  for (const [source, skills] of installedPackageSkills(projectDir)) {
    for (const path of managedSkillPaths(projectDir, skills, source)) {
      paths.add(path);
    }
  }
  for (const source of installedSources(projectDir)) {
    for (const path of managedSkillPaths(projectDir, [], source)) {
      paths.add(path);
    }
  }
  return [...paths];
}
