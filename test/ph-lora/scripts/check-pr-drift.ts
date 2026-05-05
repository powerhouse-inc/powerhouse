/**
 * ph-lora Tier 2 — PR-level doc drift classifier.
 *
 * Algorithm:
 *   1. Get files changed in this PR (git diff BASE..HEAD)
 *   2. Load ph-lora-mapping.json
 *   3. For each section: did any of its packages change?
 *      No  → skip (free)
 *      Yes → did the corresponding docPath also change?
 *        Yes → authors updated docs themselves, skip
 *        No  → send filtered diff + checkFocus to Claude Haiku
 *              YES → open GitHub issue
 *
 * Required env:
 *   ANTHROPIC_API_KEY  — Anthropic API key
 *   GH_TOKEN           — GitHub token (write:issues)
 *   BASE_SHA           — PR base commit SHA
 *   HEAD_SHA           — PR head commit SHA
 *   PR_NUMBER          — PR number
 *   GITHUB_REPOSITORY  — owner/repo (set automatically in Actions)
 */

import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MONOREPO_ROOT = path.resolve(__dirname, "../../..");
const MAPPING_PATH = path.resolve(__dirname, "../ph-lora-mapping.json");
// Academy docs live under this prefix in the monorepo
const ACADEMY_DOC_PREFIX = "apps/academy/";
// Truncate diffs to keep prompts cheap
const MAX_DIFF_CHARS = 6000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MappingSection {
  id: string;
  label: string;
  docPath: string;
  packages: string[];
  checkFocus: string;
  skipMechanicalCheck?: boolean;
}

interface Mapping {
  sections: MappingSection[];
}

interface ClassifyResult {
  drifted: boolean;
  reason: string;
}

interface DriftCandidate {
  section: MappingSection;
  changedPackageFiles: string[];
  diff: string;
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

function git(cmd: string): string {
  return execSync(cmd, { cwd: MONOREPO_ROOT, encoding: "utf8" }).trim();
}

function changedFiles(base: string, head: string): string[] {
  return git(`git diff --name-only ${base}...${head}`)
    .split("\n")
    .filter(Boolean);
}

function diffForPaths(base: string, head: string, paths: string[]): string {
  if (paths.length === 0) return "";
  const pathArgs = paths.map((p) => `"${p}"`).join(" ");
  try {
    const raw = git(`git diff ${base}...${head} --unified=3 -- ${pathArgs}`);
    return raw.length > MAX_DIFF_CHARS
      ? raw.slice(0, MAX_DIFF_CHARS) + "\n... (diff truncated)"
      : raw;
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function loadMapping(): Mapping {
  return JSON.parse(fs.readFileSync(MAPPING_PATH, "utf8")) as Mapping;
}

function packageFileChanged(
  changed: string[],
  packagePaths: string[],
): string[] {
  return changed.filter((f) =>
    packagePaths.some((pkg) => f.startsWith(pkg + "/") || f === pkg),
  );
}

function docChanged(changed: string[], docPath: string): boolean {
  const fullDocPath = ACADEMY_DOC_PREFIX + docPath;
  // docPath may be a file or a directory prefix
  return changed.some(
    (f) => f === fullDocPath || f.startsWith(fullDocPath + "/"),
  );
}

// ---------------------------------------------------------------------------
// Anthropic API — native fetch, no SDK dependency
// ---------------------------------------------------------------------------

async function classify(candidate: DriftCandidate): Promise<ClassifyResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const { section, diff } = candidate;

  const userPrompt = `You are reviewing a code diff from the Powerhouse monorepo.

Section being reviewed: ${section.label}
Packages changed: ${section.packages.join(", ")}
What to focus on: ${section.checkFocus}

<diff>
${diff || "(no diff content available)"}
</diff>

Does this diff change any PUBLICLY DOCUMENTED API — exported functions, hooks, types, CLI commands, or configuration formats that external developers use?

Respond with JSON only, no other text:
{"drifted": true, "reason": "one sentence explaining what changed"}
or
{"drifted": false, "reason": "one sentence explaining why this is internal"}

Internal changes (implementation details, tests, build scripts, refactors with identical public signatures) should be drifted: false.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${body}`);
  }

  const data = (await res.json()) as {
    content: Array<{ type: string; text: string }>;
  };
  const text = data.content[0]?.text?.trim() ?? "";

  try {
    return JSON.parse(text) as ClassifyResult;
  } catch {
    // Fallback if the model didn't produce valid JSON
    return {
      drifted: text.toLowerCase().includes('"drifted": true'),
      reason: text.slice(0, 200),
    };
  }
}

// ---------------------------------------------------------------------------
// GitHub issue creation
// ---------------------------------------------------------------------------

function createIssue(
  candidate: DriftCandidate,
  result: ClassifyResult,
  prNumber: string,
  repo: string,
): void {
  const { section } = candidate;
  const docFullPath = ACADEMY_DOC_PREFIX + section.docPath;

  const body = [
    `## Documentation drift detected by ph-lora`,
    ``,
    `**PR:** #${prNumber}`,
    `**Section:** ${section.label}`,
    `**Changed packages:** ${section.packages.map((p) => `\`${p}\``).join(", ")}`,
    `**Responsible doc:** \`${docFullPath}\``,
    ``,
    `### Why this was flagged`,
    result.reason,
    ``,
    `### Changed source files`,
    candidate.changedPackageFiles.map((f) => `- \`${f}\``).join("\n"),
    ``,
    `### What to verify`,
    section.checkFocus,
    ``,
    `---`,
    `*Opened automatically by ph-lora Tier 2. Close as "not relevant" if this is an internal change that doesn't affect the public API.*`,
  ].join("\n");

  const title = `[ph-lora] Doc drift: ${section.label} changed without doc update (PR #${prNumber})`;

  execSync(
    `gh issue create --title ${JSON.stringify(title)} --body ${JSON.stringify(body)} --repo ${repo}`,
    { cwd: MONOREPO_ROOT, stdio: "inherit" },
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn(
      "⚠  ANTHROPIC_API_KEY not set — skipping ph-lora Tier 2 drift check.",
    );
    process.exit(0);
  }

  const base = process.env.BASE_SHA;
  const head = process.env.HEAD_SHA;
  const prNumber = process.env.PR_NUMBER;
  const repo = process.env.GITHUB_REPOSITORY;

  if (!base || !head || !prNumber || !repo) {
    console.error(
      "Missing required env: BASE_SHA, HEAD_SHA, PR_NUMBER, GITHUB_REPOSITORY",
    );
    process.exit(1);
  }

  console.log(`ph-lora Tier 2: checking PR #${prNumber} (${base}...${head})`);

  const mapping = loadMapping();
  const changed = changedFiles(base, head);

  console.log(`  ${changed.length} files changed in this PR`);

  // Build candidates: sections where code changed but docs didn't
  const candidates: DriftCandidate[] = [];

  for (const section of mapping.sections) {
    if (section.skipMechanicalCheck) continue;

    const packageFiles = packageFileChanged(changed, section.packages);
    if (packageFiles.length === 0) continue;

    if (docChanged(changed, section.docPath)) {
      console.log(`  ✅ ${section.label}: code changed, docs also updated`);
      continue;
    }

    const diff = diffForPaths(base, head, packageFiles);
    candidates.push({ section, changedPackageFiles: packageFiles, diff });
  }

  if (candidates.length === 0) {
    console.log("  No drift candidates — done.");
    process.exit(0);
  }

  console.log(`  ${candidates.length} section(s) to classify...`);

  let issuesOpened = 0;

  for (const candidate of candidates) {
    console.log(`  Classifying: ${candidate.section.label}...`);
    let result: ClassifyResult;

    try {
      result = await classify(candidate);
    } catch (err) {
      console.error(`  Error classifying ${candidate.section.label}:`, err);
      continue;
    }

    if (result.drifted) {
      console.log(`  ❌ Drift detected: ${result.reason}`);
      createIssue(candidate, result, prNumber, repo);
      issuesOpened++;
    } else {
      console.log(`  ✅ No public drift: ${result.reason}`);
    }
  }

  console.log(`\nph-lora Tier 2 done. ${issuesOpened} issue(s) opened.`);
}

main().catch((err) => {
  console.error("ph-lora Tier 2 failed:", err);
  process.exit(1);
});
