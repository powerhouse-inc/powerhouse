import fs from "node:fs";
import path from "node:path";
import { renderSkillTemplate, slugToTitle } from "../index.js";
import type { ResolvedBuildConfig } from "./types.js";

/**
 * Find the first existing directory across multiple include paths.
 */
function findSubdir(includes: string[], subdir: string): string | undefined {
  for (const dir of includes) {
    const p = path.join(dir, subdir);
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

/**
 * Build SKILL.md files from Handlebars templates in skills-tpl/.
 * Each skill directory produces a SKILL.md + references/ folder.
 *
 * @returns Number of skills built and any warnings.
 */
export function buildSkillTemplates(config: ResolvedBuildConfig): {
  count: number;
  warnings: string[];
} {
  const log = config.logger;
  const skillsTplSubdir = config.subdirs?.skillsTpl ?? "skills-tpl";
  const skillsTplDir = findSubdir(config.include, skillsTplSubdir);

  log("\n--- Building SKILL.md files (templates) ---");

  if (!skillsTplDir) {
    log("  No skills-tpl/ directory — skipping.");
    return { count: 0, warnings: [] };
  }

  const skillDirs = fs
    .readdirSync(skillsTplDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const allWarnings: string[] = [];
  const renderOpts = config.customHelpers
    ? { helpers: config.customHelpers }
    : undefined;
  let count = 0;

  for (const skillName of skillDirs) {
    const skillDir = path.join(skillsTplDir, skillName);

    // Preamble
    const preamblePath = path.join(skillDir, ".preamble.md");
    const preambleRaw = fs.existsSync(preamblePath)
      ? fs.readFileSync(preamblePath, "utf-8").trim()
      : "";
    let preamble = "";
    if (preambleRaw) {
      const r = renderSkillTemplate(preambleRaw, config.context, renderOpts);
      preamble = r.rendered;
      for (const w of r.warnings) {
        const msg = `${skillName}/.preamble.md: ${w}`;
        allWarnings.push(msg);
        log(`  WARN ${msg}`);
      }
    }

    // Scenario files (NN.name.md)
    const scenarioFiles = fs
      .readdirSync(skillDir)
      .filter((f) => /^\d+\..*\.md$/.test(f))
      .sort();

    // Result file
    const resultPath = path.join(skillDir, ".result.md");
    const hasResult = fs.existsSync(resultPath);

    if (!preamble && scenarioFiles.length === 0 && !hasResult) {
      log(`  SKIP ${skillName}: no content files found`);
      continue;
    }

    // Render references into memory
    const files: Map<string, string> = new Map();
    const refLinks: string[] = [];

    for (const scenarioFile of scenarioFiles) {
      const content = fs
        .readFileSync(path.join(skillDir, scenarioFile), "utf-8")
        .trim();
      const r = renderSkillTemplate(content, config.context, renderOpts);
      for (const w of r.warnings) {
        const msg = `${skillName}/${scenarioFile}: ${w}`;
        allWarnings.push(msg);
        log(`  WARN ${msg}`);
      }
      files.set(path.join("references", scenarioFile), r.rendered + "\n");
      const label = slugToTitle(
        scenarioFile.replace(/^\d+\./, "").replace(/\.md$/, ""),
      );
      refLinks.push(
        `* **${label}** [references/${scenarioFile}](references/${scenarioFile})`,
      );
    }

    if (hasResult) {
      const content = fs.readFileSync(resultPath, "utf-8").trim();
      const r = renderSkillTemplate(content, config.context, renderOpts);
      for (const w of r.warnings) {
        const msg = `${skillName}/.result.md: ${w}`;
        allWarnings.push(msg);
        log(`  WARN ${msg}`);
      }
      files.set(
        path.join("references", "expected-outcome.md"),
        r.rendered + "\n",
      );
      refLinks.push(
        `* **Expected Outcome** [references/expected-outcome.md](references/expected-outcome.md)`,
      );
    }

    // Build SKILL.md
    const description =
      config.skillDescriptions[skillName] ?? `${slugToTitle(skillName)} tasks`;

    const frontmatter = [
      "---",
      `name: ${skillName}`,
      `description: "${description}"`,
      "metadata:",
      "  author: Powerhouse",
      '  version: "1.0.0"',
      "---",
    ].join("\n");

    const sections = [preamble];
    if (refLinks.length > 0) {
      sections.push("## Specific tasks\n\n" + refLinks.join("\n"));
    }

    const skillMd =
      frontmatter + "\n\n" + sections.filter(Boolean).join("\n\n") + "\n";
    files.set("SKILL.md", skillMd);

    // Copy .cli-docs.md if present (render through Handlebars)
    const cliDocsPath = path.join(skillDir, ".cli-docs.md");
    if (fs.existsSync(cliDocsPath)) {
      const cliDocsRaw = fs.readFileSync(cliDocsPath, "utf-8").trim();
      if (cliDocsRaw) {
        const r = renderSkillTemplate(cliDocsRaw, config.context, renderOpts);
        for (const w of r.warnings) {
          const msg = `${skillName}/.cli-docs.md: ${w}`;
          allWarnings.push(msg);
          log(`  WARN ${msg}`);
        }
        files.set(".cli-docs.md", r.rendered + "\n");
      }
    }

    // Write to all output directories
    for (const out of config.output) {
      const outputDir = path.join(out, "skills", skillName);
      for (const [relPath, content] of files) {
        const fullPath = path.join(outputDir, relPath);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content, "utf-8");
      }
    }

    log(
      `  OK ${skillName} → SKILL.md + ${scenarioFiles.length + (hasResult ? 1 : 0)} references (${skillMd.length} chars)`,
    );
    count++;
  }

  return { count, warnings: allWarnings };
}
