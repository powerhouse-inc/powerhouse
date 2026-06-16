import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

/**
 * Generates the Reactor Recipes section of the Cookbook by fetching each
 * recipe's README from the powerhouse-inc/recipes repository and rendering it
 * inline behind a <details> toggle — mirroring how the CLI reference is
 * assembled by generate-combined-cli-docs.ts.
 *
 * The list of recipes is parsed from the existing table in the Cookbook (the
 * single source of truth), so adding a row there is all that's needed to pull
 * a new recipe in. Run with: pnpm --filter @powerhousedao/academy generate:recipe-docs
 */

const REPO = "powerhouse-inc/recipes";
const BRANCH = "main";
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/${BRANCH}`;
const TREE_BASE = `https://github.com/${REPO}/tree/${BRANCH}`;
const BLOB_BASE = `https://github.com/${REPO}/blob/${BRANCH}`;

const START = "{/* AUTO-GENERATED-RECIPE-DOCS-START */}";
const END = "{/* AUTO-GENERATED-RECIPE-DOCS-END */}";

type Recipe = { title: string; slug: string; description: string };

/** Parse recipe rows from the markdown table linking to the recipes repo. */
function parseRecipes(cookbook: string): Recipe[] {
  const rowRe = new RegExp(
    `\\|\\s*\\[([^\\]]+)\\]\\(https://github\\.com/${REPO.replace(
      "/",
      "\\/",
    )}/tree/${BRANCH}/([^)\\s]+)\\)\\s*\\|\\s*([^|]+?)\\s*\\|`,
    "g",
  );
  const recipes: Recipe[] = [];
  for (const m of cookbook.matchAll(rowRe)) {
    recipes.push({ title: m[1].trim(), slug: m[2].trim(), description: m[3].trim() });
  }
  return recipes;
}

/**
 * Make README markdown safe to embed in an MDX page. Fence-aware: fenced code
 * blocks are left untouched (MDX never parses JSX inside them, and generics
 * like `Kysely<DB>` must survive). Only prose segments are transformed.
 */
function sanitizeForMdx(md: string, slug: string): string {
  // Split on fenced code blocks; odd indices are the fences themselves.
  const segments = md.split(/(```[\s\S]*?```)/g);
  return segments
    .map((seg, i) => (i % 2 === 1 ? seg : transformProse(seg, slug)))
    .join("");
}

function transformProse(text: string, slug: string): string {
  // 1) Demote headings by two levels so README h1/h2 don't pollute the page
  //    TOC (toc_max_heading_level: 2) and stay consistent with other recipes.
  text = text.replace(/^(#{1,6})(\s)/gm, (_m, hashes: string, sp: string) => {
    const level = Math.min(hashes.length + 2, 6);
    return "#".repeat(level) + sp;
  });

  // 2) Rewrite relative links/images to absolute repo URLs.
  //    Images → raw; links → blob (file) — both rooted at the recipe folder.
  text = text.replace(
    /(!?)\[([^\]]*)\]\((?!https?:\/\/|#|mailto:)([^)]+)\)/g,
    (_m, bang: string, label: string, target: string) => {
      const clean = target.replace(/^\.\//, "");
      const base = bang ? `${RAW_BASE}/${slug}` : `${BLOB_BASE}/${slug}`;
      return `${bang}[${label}](${base}/${clean})`;
    },
  );

  // 3) Escape MDX-hostile characters outside inline code spans.
  const parts = text.split(/(`[^`\n]*`)/g);
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part; // inline code — leave as-is
      return part
        .replace(/\{/g, "\\{")
        .replace(/\}/g, "\\}")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    })
    .join("");
}

async function fetchReadme(slug: string): Promise<string | null> {
  const url = `${RAW_BASE}/${slug}/README.md`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`  ⚠️  ${slug}: README fetch failed (HTTP ${res.status}) — skipping inline content`);
    return null;
  }
  return res.text();
}

function renderRecipe(recipe: Recipe, readme: string | null): string {
  const source = `${TREE_BASE}/${recipe.slug}`;
  const body = readme
    ? sanitizeForMdx(readme.trim(), recipe.slug)
    : `> README could not be loaded at generation time. View it on GitHub.`;
  return [
    `<details id="recipe-${recipe.slug}">`,
    `<summary><strong>${recipe.title}</strong> — ${recipe.description}</summary>`,
    ``,
    body,
    ``,
    `[View source on GitHub →](${source})`,
    `</details>`,
  ].join("\n");
}

async function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const cookbookPath = path.resolve(
    __dirname,
    "..",
    "docs",
    "academy",
    "04-Reference",
    "03-Cookbook.md",
  );

  let cookbook = fs.readFileSync(cookbookPath, "utf8");

  const startIndex = cookbook.indexOf(START);
  const endIndex = cookbook.indexOf(END);
  if (startIndex === -1 || endIndex === -1) {
    console.error(
      `Error: placeholders not found in ${cookbookPath}. Add:\n${START}\n${END}\nto the Reactor Recipes section.`,
    );
    process.exit(1);
  }

  const recipes = parseRecipes(cookbook);
  if (recipes.length === 0) {
    console.error("Error: no recipes parsed from the Cookbook table.");
    process.exit(1);
  }
  console.log(`Found ${recipes.length} recipes. Fetching READMEs…`);

  const blocks: string[] = [];
  for (const recipe of recipes) {
    const readme = await fetchReadme(recipe.slug);
    console.log(`  ${readme ? "✅" : "⚠️ "} ${recipe.slug}`);
    blocks.push(renderRecipe(recipe, readme));
  }

  const generated =
    `\n{/* This content is automatically generated by scripts/generate-recipe-docs.ts. Do not edit directly. */}\n\n` +
    blocks.join("\n\n") +
    `\n`;

  cookbook =
    cookbook.substring(0, startIndex + START.length) +
    generated +
    cookbook.substring(endIndex);

  fs.writeFileSync(cookbookPath, cookbook);
  console.log(`✅ Reactor recipe docs generated into ${cookbookPath}`);
}

main().catch((err) => {
  console.error("Failed to generate recipe docs:", err);
  process.exit(1);
});
