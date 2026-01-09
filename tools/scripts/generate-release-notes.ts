#!/usr/bin/env tsx
/**
 * Generate AI-written release notes from changelog entries
 *
 * Usage:
 *   # Generate prompt for local Claude (default mode)
 *   npx tsx tools/scripts/generate-release-notes.ts --latest
 *   npx tsx tools/scripts/generate-release-notes.ts --from v5.1.0-dev.30 --to v5.1.0-dev.34
 *
 *   # Copy prompt to clipboard (macOS)
 *   npx tsx tools/scripts/generate-release-notes.ts --latest --clipboard
 *
 *   # Use Anthropic API directly (requires ANTHROPIC_API_KEY)
 *   ANTHROPIC_API_KEY=sk-ant-... npx tsx tools/scripts/generate-release-notes.ts --latest --api
 *
 * Environment variables:
 *   ANTHROPIC_API_KEY - Required only when using --api mode
 *   GITHUB_TOKEN - Optional, for fetching PR descriptions
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

// Dynamic import for Anthropic SDK (only when needed)
async function getAnthropicClient() {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  return Anthropic;
}

const CHANGELOG_PATH = "CHANGELOG.md";
const RELEASE_NOTES_PATH = "RELEASE-NOTES.md";

interface ChangelogEntry {
  version: string;
  date: string;
  features: string[];
  fixes: string[];
  contributors: string[];
  rawContent: string;
}

interface PRInfo {
  number: string;
  title: string;
  body: string;
}

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
  .option("from", {
    type: "string",
    description: "Start version (exclusive)",
  })
  .option("to", {
    type: "string",
    description: "End version (inclusive)",
  })
  .option("latest", {
    type: "boolean",
    description: "Generate notes for the latest version only",
    default: false,
  })
  .option("env", {
    type: "string",
    description:
      "Environment name for output file (e.g., dev, staging, prod)",
    default: "",
  })
  .option("output", {
    type: "string",
    description: "Custom output file path",
  })
  .option("dry-run", {
    type: "boolean",
    description: "Print generated notes without writing to file",
    default: false,
  })
  .option("verbose", {
    type: "boolean",
    description: "Show debug information",
    default: false,
  })
  .option("include-prs", {
    type: "boolean",
    description: "Fetch PR descriptions for additional context",
    default: false,
  })
  .option("model", {
    type: "string",
    description: "Claude model to use (only for --api mode)",
    default: "claude-sonnet-4-20250514",
  })
  .option("api", {
    type: "boolean",
    description: "Use Anthropic API instead of generating prompt (requires ANTHROPIC_API_KEY)",
    default: false,
  })
  .option("clipboard", {
    type: "boolean",
    description: "Copy the generated prompt to clipboard (macOS/Linux)",
    default: false,
  })
  .option("prompt-only", {
    type: "boolean",
    description: "Only output the prompt (no headers or instructions)",
    default: false,
  })
  .parseSync();

/**
 * Parse CHANGELOG.md and extract entries
 */
function parseChangelog(content: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  const versionRegex = /^## (\d+\.\d+\.\d+(?:-[a-zA-Z]+\.\d+)?) \((\d{4}-\d{2}-\d{2})\)/gm;

  let match;
  const positions: { version: string; date: string; start: number }[] = [];

  while ((match = versionRegex.exec(content)) !== null) {
    positions.push({
      version: match[1],
      date: match[2],
      start: match.index,
    });
  }

  for (let i = 0; i < positions.length; i++) {
    const current = positions[i];
    const next = positions[i + 1];
    const rawContent = content.slice(
      current.start,
      next?.start ?? content.length,
    );

    // Extract features
    const featuresMatch = rawContent.match(
      /### 🚀 Features\n\n([\s\S]*?)(?=\n### |$)/,
    );
    const features = featuresMatch
      ? featuresMatch[1]
          .split("\n")
          .filter((l) => l.startsWith("- "))
          .map((l) => l.slice(2).trim())
      : [];

    // Extract fixes
    const fixesMatch = rawContent.match(
      /### 🩹 Fixes\n\n([\s\S]*?)(?=\n### |$)/,
    );
    const fixes = fixesMatch
      ? fixesMatch[1]
          .split("\n")
          .filter((l) => l.startsWith("- "))
          .map((l) => l.slice(2).trim())
      : [];

    // Extract contributors
    const contributorsMatch = rawContent.match(
      /### ❤️ Thank You\n\n([\s\S]*?)(?=\n## |$)/,
    );
    const contributors = contributorsMatch
      ? contributorsMatch[1]
          .split("\n")
          .filter((l) => l.startsWith("- "))
          .map((l) => l.slice(2).trim())
      : [];

    entries.push({
      version: current.version,
      date: current.date,
      features,
      fixes,
      contributors,
      rawContent: rawContent.trim(),
    });
  }

  return entries;
}

/**
 * Get changelog entries between two versions
 */
function getEntriesBetweenVersions(
  entries: ChangelogEntry[],
  fromVersion?: string,
  toVersion?: string,
): ChangelogEntry[] {
  let startIdx = 0;
  let endIdx = entries.length;

  if (toVersion) {
    startIdx = entries.findIndex((e) => e.version === toVersion);
    if (startIdx === -1) startIdx = 0;
  }

  if (fromVersion) {
    endIdx = entries.findIndex((e) => e.version === fromVersion);
    if (endIdx === -1) endIdx = entries.length;
  }

  return entries.slice(startIdx, endIdx);
}

/**
 * Extract PR numbers from changelog entries
 */
function extractPRNumbers(entries: ChangelogEntry[]): string[] {
  const prNumbers: Set<string> = new Set();
  const prRegex = /\[#(\d+)\]/g;

  for (const entry of entries) {
    let match;
    while ((match = prRegex.exec(entry.rawContent)) !== null) {
      prNumbers.add(match[1]);
    }
  }

  return Array.from(prNumbers);
}

/**
 * Fetch PR information from GitHub (optional)
 */
async function fetchPRInfo(prNumbers: string[]): Promise<PRInfo[]> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.warn("GITHUB_TOKEN not set, skipping PR description fetch");
    return [];
  }

  const prInfos: PRInfo[] = [];

  for (const prNumber of prNumbers.slice(0, 20)) {
    // Limit to 20 PRs
    try {
      const response = await fetch(
        `https://api.github.com/repos/powerhouse-inc/powerhouse/pulls/${prNumber}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github.v3+json",
          },
        },
      );

      if (response.ok) {
        const data = await response.json();
        prInfos.push({
          number: prNumber,
          title: data.title,
          body: data.body || "",
        });
      }
    } catch (error) {
      console.warn(`Failed to fetch PR #${prNumber}:`, error);
    }
  }

  return prInfos;
}

/**
 * Get the latest git tag
 */
function getLatestTag(): string | null {
  try {
    return execSync("git describe --tags --abbrev=0", {
      encoding: "utf-8",
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Read existing RELEASE-NOTES.md to provide as context
 */
function getExistingReleaseNotesContext(): string {
  try {
    const content = fs.readFileSync(RELEASE_NOTES_PATH, "utf-8");
    // Return first ~3000 chars as context for style matching
    return content.slice(0, 3000);
  } catch {
    return "";
  }
}

/**
 * Build the prompt for Claude
 */
function buildPrompt(
  entries: ChangelogEntry[],
  prInfos: PRInfo[],
  existingNotesContext: string,
): string {
  const consolidatedChanges = {
    features: entries.flatMap((e) => e.features),
    fixes: entries.flatMap((e) => e.fixes),
    contributors: [...new Set(entries.flatMap((e) => e.contributors))],
  };

  const versionRange =
    entries.length > 1
      ? `${entries[entries.length - 1].version} → ${entries[0].version}`
      : entries[0]?.version || "Unknown";

  let prompt = `You are a technical writer for Powerhouse, a developer tools company. Generate release notes for version range: ${versionRange}

## Raw Changelog Entries

${entries.map((e) => e.rawContent).join("\n\n---\n\n")}

## Consolidated Changes

### Features (${consolidatedChanges.features.length})
${consolidatedChanges.features.map((f) => `- ${f}`).join("\n")}

### Fixes (${consolidatedChanges.fixes.length})
${consolidatedChanges.fixes.map((f) => `- ${f}`).join("\n")}

### Contributors
${consolidatedChanges.contributors.map((c) => `- ${c}`).join("\n")}
`;

  if (prInfos.length > 0) {
    prompt += `\n## PR Descriptions (for additional context)\n\n`;
    for (const pr of prInfos) {
      prompt += `### PR #${pr.number}: ${pr.title}\n${pr.body.slice(0, 500)}\n\n`;
    }
  }

  if (existingNotesContext) {
    prompt += `\n## Style Reference (match this writing style)\n\n${existingNotesContext}\n`;
  }

  prompt += `
## Instructions

Generate release notes following this structure:

1. **Version Header** with emoji and version number
2. **Highlights** - 3-5 bullet points summarizing the most impactful changes
3. **NEW FEATURES** - Detailed sections for significant features with:
   - Clear explanation of what it does and why it matters
   - Code examples where relevant (TypeScript/bash)
   - Configuration options if applicable
4. **IMPROVEMENTS** - Notable enhancements
5. **BUG FIXES** - Important fixes (can be brief)
6. **BREAKING CHANGES** - If any, with migration steps

Guidelines:
- Write for developers who use Powerhouse tools
- Explain "why" not just "what" changed
- Include practical code examples for new APIs
- Group related changes together
- Highlight migration steps for breaking changes
- Keep a friendly but professional tone
- Use markdown formatting

Output ONLY the release notes content, ready to be added to RELEASE-NOTES.md.`;

  return prompt;
}

/**
 * Generate release notes using Claude API
 */
async function generateReleaseNotes(
  entries: ChangelogEntry[],
  prInfos: PRInfo[],
  existingNotesContext: string,
  model: string,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY environment variable is required. " +
        "Get your API key from https://console.anthropic.com/",
    );
  }

  const Anthropic = await getAnthropicClient();
  const anthropic = new Anthropic({ apiKey });

  const prompt = buildPrompt(entries, prInfos, existingNotesContext);

  console.log(`Generating release notes using ${model}...`);

  const response = await anthropic.messages.create({
    model,
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const textContent = response.content.find((c) => c.type === "text");
  if (!textContent || textContent.type !== "text") {
    throw new Error("No text content in Claude response");
  }

  return textContent.text;
}

/**
 * Determine output file path
 */
function getOutputPath(env: string, customOutput?: string): string {
  if (customOutput) {
    return customOutput;
  }

  if (env) {
    return `CHANGELOG.${env}.md`;
  }

  return RELEASE_NOTES_PATH;
}

/**
 * Write or prepend release notes to file
 */
function writeReleaseNotes(
  content: string,
  outputPath: string,
  prepend: boolean = true,
): void {
  const fullPath = path.resolve(process.cwd(), outputPath);

  if (prepend && fs.existsSync(fullPath)) {
    const existing = fs.readFileSync(fullPath, "utf-8");
    // Find the first version header and insert before it
    const firstVersionMatch = existing.match(/^## /m);
    if (firstVersionMatch && firstVersionMatch.index !== undefined) {
      const before = existing.slice(0, firstVersionMatch.index);
      const after = existing.slice(firstVersionMatch.index);
      fs.writeFileSync(fullPath, before + content + "\n\n" + after);
    } else {
      fs.writeFileSync(fullPath, content + "\n\n" + existing);
    }
  } else {
    // For env-specific files, create/overwrite with header
    const header =
      outputPath.includes("CHANGELOG.") && !outputPath.includes("RELEASE")
        ? `# ${outputPath.replace(".md", "").replace("CHANGELOG.", "").toUpperCase()} Release Notes\n\n`
        : "";
    fs.writeFileSync(fullPath, header + content);
  }

  console.log(`✅ Release notes written to ${outputPath}`);
}

/**
 * Main execution
 */
/**
 * Copy text to clipboard (cross-platform)
 */
function copyToClipboard(text: string): boolean {
  try {
    const platform = process.platform;
    if (platform === "darwin") {
      execSync("pbcopy", { input: text });
    } else if (platform === "linux") {
      // Try xclip first, then xsel
      try {
        execSync("xclip -selection clipboard", { input: text });
      } catch {
        execSync("xsel --clipboard --input", { input: text });
      }
    } else if (platform === "win32") {
      execSync("clip", { input: text });
    } else {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const {
    from,
    to,
    latest,
    env,
    output,
    dryRun,
    verbose,
    includePrs,
    model,
    api,
    clipboard,
    promptOnly,
  } = argv;

  // Read and parse changelog
  console.log("📖 Reading CHANGELOG.md...");
  const changelogContent = fs.readFileSync(CHANGELOG_PATH, "utf-8");
  const allEntries = parseChangelog(changelogContent);

  if (verbose) {
    console.log(`Found ${allEntries.length} changelog entries`);
  }

  // Determine version range
  let fromVersion = from;
  let toVersion = to;

  if (latest) {
    toVersion = allEntries[0]?.version;
    fromVersion = allEntries[1]?.version;
    console.log(`📌 Latest version: ${toVersion}`);
  }

  // Get entries for the specified range
  const entries = getEntriesBetweenVersions(allEntries, fromVersion, toVersion);

  if (entries.length === 0) {
    console.error("❌ No changelog entries found for the specified range");
    process.exit(1);
  }

  console.log(
    `📝 Processing ${entries.length} entries: ${entries[entries.length - 1]?.version || "?"} → ${entries[0]?.version || "?"}`,
  );

  // Optionally fetch PR info
  let prInfos: PRInfo[] = [];
  if (includePrs) {
    console.log("🔍 Fetching PR descriptions...");
    const prNumbers = extractPRNumbers(entries);
    prInfos = await fetchPRInfo(prNumbers);
    console.log(`Found ${prInfos.length} PR descriptions`);
  }

  // Get existing release notes for style context
  const existingNotesContext = getExistingReleaseNotesContext();

  // Build the prompt
  const prompt = buildPrompt(entries, prInfos, existingNotesContext);

  // Mode: Generate prompt for local Claude usage (default)
  if (!api) {
    const versionRange =
      entries.length > 1
        ? `${entries[entries.length - 1]?.version} → ${entries[0]?.version}`
        : entries[0]?.version || "Unknown";

    if (promptOnly) {
      // Just output the raw prompt
      console.log(prompt);
    } else {
      // Output with helpful instructions
      console.log("\n" + "=".repeat(70));
      console.log("📋 RELEASE NOTES PROMPT");
      console.log("=".repeat(70));
      console.log(`\nVersion range: ${versionRange}`);
      console.log(`Entries included: ${entries.length}`);
      console.log(`PR descriptions: ${prInfos.length}`);
      console.log("\n" + "-".repeat(70));
      console.log("Copy the prompt below and paste it into Claude (Cursor, Claude.ai, etc.)");
      console.log("-".repeat(70) + "\n");
      console.log(prompt);
      console.log("\n" + "=".repeat(70));
    }

    if (clipboard) {
      const copied = copyToClipboard(prompt);
      if (copied) {
        console.log("\n✅ Prompt copied to clipboard!");
      } else {
        console.log("\n⚠️  Could not copy to clipboard. Please copy manually.");
      }
    } else if (!promptOnly) {
      console.log("\n💡 Tip: Run with --clipboard to auto-copy the prompt");
    }

    // Also save prompt to a temp file for easy access
    if (!promptOnly && !dryRun) {
      const promptFile = ".release-notes-prompt.md";
      fs.writeFileSync(promptFile, prompt);
      console.log(`📄 Prompt saved to ${promptFile}`);
    }

    return;
  }

  // Mode: Use Anthropic API directly
  console.log("🤖 Using Anthropic API...");
  const releaseNotes = await generateReleaseNotes(
    entries,
    prInfos,
    existingNotesContext,
    model,
  );

  if (dryRun) {
    console.log("\n" + "=".repeat(60) + "\n");
    console.log(releaseNotes);
    console.log("\n" + "=".repeat(60));
    console.log("\n🔍 Dry run complete - no files written");
  } else {
    const outputPath = getOutputPath(env, output);
    const shouldPrepend = outputPath === RELEASE_NOTES_PATH;
    writeReleaseNotes(releaseNotes, outputPath, shouldPrepend);
  }
}

main().catch((error) => {
  console.error("❌ Error:", error.message);
  process.exit(1);
});

