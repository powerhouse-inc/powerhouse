import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

/**
 * Generates the Reactor Recipes section of the Cookbook (summary table + each
 * recipe's README inlined behind a <details> toggle).
 *
 * The recipe list is DISCOVERED from the powerhouse-inc/recipes repository
 * itself — every top-level directory that has both a README.md and a
 * package.json is treated as a recipe. This means a new recipe shows up here
 * automatically once it is pushed; nothing in this repo needs editing.
 *
 * Run with: pnpm --filter @powerhousedao/academy generate:recipe-docs
 * Set GITHUB_TOKEN to raise the GitHub API rate limit if needed.
 */

const REPO = "powerhouse-inc/recipes";
const BRANCH = "main";
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/${BRANCH}`;
const API_CONTENTS = `https://api.github.com/repos/${REPO}/contents?ref=${BRANCH}`;
const TREE_BASE = `https://github.com/${REPO}/tree/${BRANCH}`;
const BLOB_BASE = `https://github.com/${REPO}/blob/${BRANCH}`;

const START = "{/* AUTO-GENERATED-RECIPE-DOCS-START */}";
const END = "{/* AUTO-GENERATED-RECIPE-DOCS-END */}";

// Directories that carry a README but are not runnable recipes.
const DENYLIST = new Set(["briefs"]);

type Recipe = {
  slug: string;
  title: string;
  description: string;
  readme: string;
};

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": "powerhouse-academy-docgen",
    Accept: "application/vnd.github+json",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

async function urlExists(url: string): Promise<boolean> {
  const res = await fetch(url);
  return res.ok;
}

/** Discover recipe slugs: top-level dirs with both a README.md and package.json. */
async function discoverRecipes(): Promise<string[]> {
  const res = await fetch(API_CONTENTS, { headers: githubHeaders() });
  if (!res.ok) {
    const hint =
      res.status === 403
        ? " (rate limited — set GITHUB_TOKEN to raise the limit)"
        : "";
    throw new Error(`GitHub contents API returned HTTP ${res.status}${hint}`);
  }
  const entries = (await res.json()) as Array<{ name: string; type: string }>;
  const dirs = entries
    .filter((e) => e.type === "dir")
    .map((e) => e.name)
    .filter((name) => !name.startsWith(".") && !DENYLIST.has(name));

  const checked = await Promise.all(
    dirs.map(async (name) => {
      const [hasReadme, hasPkg] = await Promise.all([
        urlExists(`${RAW_BASE}/${name}/README.md`),
        urlExists(`${RAW_BASE}/${name}/package.json`),
      ]);
      return hasReadme && hasPkg ? name : null;
    }),
  );

  return checked.filter((s): s is string => s !== null).sort();
}

async function fetchReadme(slug: string): Promise<string | null> {
  const res = await fetch(`${RAW_BASE}/${slug}/README.md`);
  if (!res.ok) {
    console.warn(`  ⚠️  ${slug}: README fetch failed (HTTP ${res.status})`);
    return null;
  }
  return res.text();
}

function titleCase(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Human title: the README's first H1, falling back to the title-cased slug. */
function deriveTitle(readme: string | null, slug: string): string {
  const h1 = readme
    ?.split(/\r?\n/)
    .find((l) => /^#\s+\S/.test(l))
    ?.replace(/^#\s+/, "")
    .trim();
  return h1 || titleCase(slug);
}

/** Short description: the first sentence of the README's first prose paragraph. */
function deriveDescription(readme: string | null, slug: string): string {
  if (!readme) return `Reactor recipe: ${titleCase(slug)}.`;
  const lines = readme.split(/\r?\n/);
  const h1Idx = lines.findIndex((l) => /^#\s+\S/.test(l));
  let i = h1Idx >= 0 ? h1Idx + 1 : 0;
  while (i < lines.length && lines[i].trim() === "") i++;
  const buf: string[] = [];
  while (
    i < lines.length &&
    lines[i].trim() !== "" &&
    !/^#{1,6}\s/.test(lines[i])
  ) {
    buf.push(lines[i].trim());
    i++;
  }
  const paragraph = buf.join(" ").trim();
  const sentence = paragraph.match(/^(.+?\.)(?:\s|$)/);
  return (
    (sentence ? sentence[1] : paragraph) ||
    `Reactor recipe: ${titleCase(slug)}.`
  );
}

/** Escape MDX-hostile characters outside inline code spans. */
function escapeMdxProse(text: string): string {
  return text
    .split(/(`[^`\n]*`)/g)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part
            .replace(/\{/g, "\\{")
            .replace(/\}/g, "\\}")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;"),
    )
    .join("");
}

/** Same as escapeMdxProse, plus pipe escaping so it is safe inside a table cell. */
function escapeTableCell(text: string): string {
  return escapeMdxProse(text).replace(/\|/g, "\\|");
}

/**
 * Make README markdown safe to embed in an MDX page. Fence-aware: fenced code
 * blocks are left untouched (MDX never parses JSX inside them, and generics
 * like `Kysely<DB>` must survive). Only prose segments are transformed.
 */
function sanitizeForMdx(md: string, slug: string): string {
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
  return escapeMdxProse(text);
}

function renderTable(recipes: Recipe[]): string {
  const header = `| Recipe | Description |\n| --- | --- |`;
  const rows = recipes.map(
    (r) =>
      `| [${escapeTableCell(r.title)}](${TREE_BASE}/${r.slug}) | ${escapeTableCell(
        r.description,
      )} |`,
  );
  return [header, ...rows].join("\n");
}

function renderRecipe(recipe: Recipe): string {
  const source = `${TREE_BASE}/${recipe.slug}`;
  const body = recipe.readme
    ? sanitizeForMdx(recipe.readme.trim(), recipe.slug)
    : `> README could not be loaded at generation time. View it on GitHub.`;
  return [
    `<details id="recipe-${recipe.slug}">`,
    `<summary><strong>${escapeMdxProse(recipe.title)}</strong> — ${escapeMdxProse(
      recipe.description,
    )}</summary>`,
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
    "05-Lookup",
    "00-Cookbook.md",
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

  console.log(`Discovering recipes in ${REPO}@${BRANCH}…`);
  const slugs = await discoverRecipes();
  if (slugs.length === 0) {
    console.error("Error: no recipes discovered in the repository.");
    process.exit(1);
  }
  console.log(`Found ${slugs.length} recipes. Fetching READMEs…`);

  const recipes: Recipe[] = [];
  for (const slug of slugs) {
    const readme = await fetchReadme(slug);
    console.log(`  ${readme ? "✅" : "⚠️ "} ${slug}`);
    recipes.push({
      slug,
      title: deriveTitle(readme, slug),
      description: deriveDescription(readme, slug),
      readme: readme ?? "",
    });
  }

  const generated =
    `\n{/* This content is automatically generated by scripts/generate-recipe-docs.ts. Do not edit directly. */}\n\n` +
    renderTable(recipes) +
    `\n\n> See the [recipes repository](https://github.com/${REPO}) for full source code, setup instructions, and prerequisites.\n\n` +
    recipes.map(renderRecipe).join("\n\n") +
    `\n`;

  cookbook =
    cookbook.substring(0, startIndex + START.length) +
    generated +
    cookbook.substring(endIndex);

  fs.writeFileSync(cookbookPath, cookbook);
  console.log(
    `✅ Reactor recipe docs (${recipes.length} recipes) generated into ${cookbookPath}`,
  );
}

main().catch((err) => {
  console.error("Failed to generate recipe docs:", err);
  process.exit(1);
});
