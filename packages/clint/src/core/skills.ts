import fs from "node:fs";
import path from "node:path";

/**
 * Metadata extracted from a SKILL.md frontmatter.
 */
export interface SkillInfo {
  name: string;
  description: string;
  /** Absolute path to the SKILL.md file. */
  skillMdPath: string;
  /** Absolute path to the .cli-docs.md file, if present. */
  cliDocsPath?: string;
}

/**
 * Parse YAML-ish frontmatter from a SKILL.md file.
 * Only extracts `name` and `description` — no YAML parser dependency needed.
 */
function parseFrontmatter(
  content: string,
): Omit<SkillInfo, "skillMdPath"> | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const block = match[1]!;
  const nameMatch = block.match(/^name:\s*(.+)$/m);
  const descMatch = block.match(/^description:\s*"?([^"\n]+)"?$/m);

  if (!nameMatch) return null;
  return {
    name: nameMatch[1]!.trim(),
    description: descMatch ? descMatch[1]!.trim() : "",
  };
}

/**
 * Read skill metadata from artifact directories.
 *
 * Scans each artifact directory for `{skillName}/SKILL.md` files, parses
 * frontmatter, and returns a deduplicated sorted list. First directory wins
 * on name collisions. When a name appears in more than one root, `onWarn` is
 * invoked once per collision so the caller can surface the conflict.
 *
 * Convention: codegen orders artifacts as `[skills-tpl/, skills-ext/]`, so
 * tpl always wins over ext. The warning message names both roots verbatim.
 */
export function readSkills(
  artifacts: string[],
  onWarn?: (message: string) => void,
): SkillInfo[] {
  const seenAt = new Map<string, string>(); // name → first artifact root that won
  const skills: SkillInfo[] = [];

  for (const source of artifacts) {
    if (!fs.existsSync(source)) continue;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(source, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillMdPath = path.join(source, entry.name, "SKILL.md");
      if (!fs.existsSync(skillMdPath)) continue;

      const existing = seenAt.get(entry.name);
      if (existing !== undefined) {
        onWarn?.(
          `Skill "${entry.name}" exists in both ${existing} and ${source} — using ${existing}`,
        );
        continue;
      }

      try {
        const content = fs.readFileSync(skillMdPath, "utf-8");
        const info = parseFrontmatter(content);
        if (info) {
          seenAt.set(entry.name, source);
          const cliDocsPath = path.join(source, entry.name, ".cli-docs.md");
          const hasDocs = fs.existsSync(cliDocsPath);
          skills.push({
            ...info,
            skillMdPath,
            ...(hasDocs && { cliDocsPath }),
          });
        }
      } catch {
        // Skip unreadable files
      }
    }
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}
