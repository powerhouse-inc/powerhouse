import fs from "node:fs";
import path from "node:path";
import { renderSkillTemplate } from "../index.js";
import type { ResolvedBuildConfig } from "./types.js";

/**
 * Find the first existing file across multiple include directories.
 */
function findInIncludes(
  includes: string[],
  subdir: string,
  filename: string,
): string | undefined {
  for (const dir of includes) {
    const p = path.join(dir, subdir, filename);
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

/**
 * Build agent profile instructions by rendering base+specialized template pairs.
 * Writes each profile as a Markdown file in {output}/agents/{ProfileName}.md.
 *
 * @returns Number of profiles built and any warnings.
 */
export function buildAgentProfiles(config: ResolvedBuildConfig): {
  count: number;
  warnings: string[];
} {
  const log = config.logger;
  const profiles = config.agentProfiles;
  if (profiles.length === 0) return { count: 0, warnings: [] };

  const profilesSubdir = config.subdirs?.profiles ?? "agent-profiles";

  log("\n--- Building agent instructions ---");

  const allWarnings: string[] = [];
  let count = 0;

  for (const profile of profiles) {
    // Check all section files exist before rendering
    const sectionPaths: string[] = [];
    let missing = false;
    for (const section of profile.sections) {
      const found = findInIncludes(config.include, profilesSubdir, section);
      if (!found) {
        log(`  SKIP ${profile.name}: missing section ${section}`);
        missing = true;
        break;
      }
      sectionPaths.push(found);
    }
    if (missing) continue;

    const agentContext = { ...config.context, agentName: profile.name };
    const renderOpts = config.customHelpers
      ? { helpers: config.customHelpers }
      : undefined;

    const renderedSections: string[] = [];
    for (let i = 0; i < profile.sections.length; i++) {
      const raw = fs.readFileSync(sectionPaths[i], "utf-8");
      const result = renderSkillTemplate(raw, agentContext, renderOpts);
      for (const w of result.warnings) {
        const msg = `${profile.name}/${profile.sections[i]}: ${w}`;
        allWarnings.push(msg);
        log(`  WARN ${msg}`);
      }
      renderedSections.push(result.rendered.trim());
    }

    const combined = renderedSections.join("\n\n") + "\n";
    for (const out of config.output) {
      const agentsDir = path.join(out, "agent-profiles");
      fs.mkdirSync(agentsDir, { recursive: true });
      fs.writeFileSync(
        path.join(agentsDir, `${profile.name}.md`),
        combined,
        "utf-8",
      );
    }

    log(`  OK ${profile.name} → ${profile.name}.md (${combined.length} chars)`);
    count++;
  }

  return { count, warnings: allWarnings };
}
