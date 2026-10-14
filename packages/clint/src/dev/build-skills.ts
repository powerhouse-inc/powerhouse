import fs from "node:fs";
import path from "node:path";
import { buildAgentProfiles } from "./agent-profiles.js";
import { buildSkillTemplates } from "./skill-builder.js";
import { copyExternalSkills } from "./skill-copier.js";
import type { AgentProfile, ResolvedBuildConfig } from "./types.js";

/**
 * Path-driven skill/profile compilation (ph-clint-dev's pipeline, decoupled
 * from the old BuildConfig.cli metadata coupling). Conventions:
 *
 *   <skillsDir>/              include root (default: prompts/ then agents/)
 *     agent-profiles/         profile section templates
 *     skills-tpl/<skill>/     Handlebars skill templates → SKILL.md
 *     skills-ext/<skill>/     external skills copied as-is
 *     profiles.json           optional [{ name, sections: [...] }]
 *
 * Output: <outDir> (default: dist/skills).
 */
export interface BuildSkillsOptions {
  rootDir: string;
  skillsDir?: string;
  agentsDir?: string;
  outDir?: string;
  context?: Record<string, unknown>;
  logger?: (msg: string) => void;
}

export interface BuildSkillsResult {
  skills: number;
  profiles: number;
  copied: number;
  warnings: string[];
  outDir: string;
}

function firstExisting(
  rootDir: string,
  candidates: (string | undefined)[],
): string[] {
  const dirs: string[] = [];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const abs = path.resolve(rootDir, candidate);
    if (fs.existsSync(abs)) dirs.push(abs);
  }
  return dirs;
}

function readProfilesManifest(include: string[]): AgentProfile[] {
  for (const dir of include) {
    const manifest = path.join(dir, "profiles.json");
    if (fs.existsSync(manifest)) {
      try {
        return JSON.parse(fs.readFileSync(manifest, "utf8")) as AgentProfile[];
      } catch {
        return [];
      }
    }
  }
  return [];
}

export async function buildSkills(
  options: BuildSkillsOptions,
): Promise<BuildSkillsResult> {
  const log = options.logger ?? console.log;
  const include = firstExisting(options.rootDir, [
    options.skillsDir,
    options.agentsDir,
    "prompts",
    "agents",
  ]);
  const outDir = path.resolve(options.rootDir, options.outDir ?? "dist/skills");

  if (include.length === 0) {
    log(
      "No prompt template directories found (prompts/ or agents/) — nothing to build.",
    );
    return { skills: 0, profiles: 0, copied: 0, warnings: [], outDir };
  }

  const resolved: ResolvedBuildConfig = {
    include,
    output: [outDir],
    context: { builtAt: new Date().toISOString(), ...options.context },
    agentProfiles: readProfilesManifest(include),
    skillDescriptions: {},
    clean: true,
    logger: log,
  };

  for (const dir of resolved.output) {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true });
  }

  const profiles = buildAgentProfiles(resolved);
  const templates = buildSkillTemplates(resolved);
  const copied = copyExternalSkills(resolved);

  return {
    skills: templates.count,
    profiles: profiles.count,
    copied,
    warnings: [...profiles.warnings, ...templates.warnings],
    outDir,
  };
}
