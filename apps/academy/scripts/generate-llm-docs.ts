import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const SITE_URL = "https://academy.vetra.io";

interface DocFile {
  path: string;
  content: string;
  relativePath: string;
  title: string;
  description: string;
  category: string;
  urlPath: string;
}

interface SidebarItem {
  type: string;
  label?: string;
  id?: string;
  items?: SidebarItem[];
  dirName?: string;
}

async function generateLLMDocs() {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    const academyDocsDir = path.resolve(__dirname, "..", "docs");
    const staticDir = path.resolve(__dirname, "..", "static");

    const docFiles = collectDocFiles(academyDocsDir);
    const sortedFiles = sortFilesBySidebar(docFiles);

    const llmsTxt = generateLLMsIndex(sortedFiles);
    const llmsFullTxt = generateLLMsFullContent(sortedFiles);

    // Write llms.txt (index)
    fs.writeFileSync(path.resolve(__dirname, "..", "llms.txt"), llmsTxt);
    fs.writeFileSync(path.join(staticDir, "llms.txt"), llmsTxt);

    // Write llms-full.txt (full content)
    fs.writeFileSync(
      path.resolve(__dirname, "..", "llms-full.txt"),
      llmsFullTxt,
    );
    fs.writeFileSync(path.join(staticDir, "llms-full.txt"), llmsFullTxt);

    // Keep legacy filename for backward compatibility
    fs.writeFileSync(
      path.resolve(__dirname, "..", "academy_LLM_docs.md"),
      llmsFullTxt,
    );
    fs.writeFileSync(path.join(staticDir, "academy_LLM_docs.md"), llmsFullTxt);

    console.log(
      `✅ llms.txt generated (${Math.round(llmsTxt.length / 1024)}KB)`,
    );
    console.log(
      `✅ llms-full.txt generated (${Math.round(llmsFullTxt.length / 1024)}KB)`,
    );
    console.log(`📊 Combined ${sortedFiles.length} documentation files`);
    console.log(`🔗 ${SITE_URL}/llms.txt`);
    console.log(`🔗 ${SITE_URL}/llms-full.txt`);
  } catch (error) {
    console.error("Failed to generate LLM documentation:", error);
    process.exit(1);
  }
}

// Files/directories to exclude from both llms.txt and llms-full.txt
const EXCLUDE_PATTERNS = [
  /\/_[^/]+/, // any path segment starting with underscore (drafts/archives)
  /\/home\.(md|mdx)$/, // navigation home files (contain JSX, not prose)
  /_category_\.json$/, // Docusaurus category metadata
  /\/index\.(md|mdx)$/, // generated-index pages (usually just nav)
];

function shouldExclude(relativePath: string): boolean {
  const normalized = "/" + relativePath.replace(/\\/g, "/");
  return EXCLUDE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function collectDocFiles(docsDir: string): DocFile[] {
  const docFiles: DocFile[] = [];

  function collectFiles(dir: string) {
    const items = fs.readdirSync(dir);

    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        // Skip archive/draft directories (starting with underscore)
        if (!item.startsWith("_")) collectFiles(fullPath);
      } else if (item.endsWith(".md") || item.endsWith(".mdx")) {
        const content = fs.readFileSync(fullPath, "utf8");
        const relativePath = path.relative(docsDir, fullPath);

        if (shouldExclude(relativePath)) continue;

        const title = extractTitle(content, relativePath);
        const description = extractDescription(content);
        const category = extractCategory(relativePath);
        const urlPath = buildUrlPath(relativePath);

        docFiles.push({
          path: fullPath,
          content,
          relativePath,
          title,
          description,
          category,
          urlPath,
        });
      }
    }
  }

  collectFiles(docsDir);
  return docFiles;
}

function extractTitle(content: string, relativePath: string): string {
  const titleMatch = content.match(/^#\s+(.+)$/m);
  if (titleMatch) return titleMatch[1].trim();
  return path.basename(relativePath, path.extname(relativePath));
}

function extractDescription(content: string): string {
  // Strip frontmatter
  const withoutFrontmatter = content.replace(/^---[\s\S]*?---\n/, "");
  // Skip the first heading
  const withoutTitle = withoutFrontmatter.replace(/^#\s+.+\n/, "").trim();
  // Find first non-empty, non-heading, non-directive paragraph
  const lines = withoutTitle.split("\n");
  const descLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (
      !trimmed ||
      trimmed.startsWith("#") ||
      trimmed.startsWith(":::") ||
      trimmed.startsWith("import ") ||
      trimmed.startsWith("<") || // JSX/HTML tags
      trimmed.startsWith("{") || // JSX expressions
      trimmed.startsWith("📦") // emoji-only lines
    ) {
      if (descLines.length > 0) break;
      continue;
    }
    // Strip markdown formatting for a plain description
    const plain = trimmed
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/`(.+?)`/g, "$1")
      .replace(/\[(.+?)\]\(.+?\)/g, "$1");
    descLines.push(plain);
    if (descLines.join(" ").length > 120) break;
  }

  const desc = descLines.join(" ").slice(0, 150);
  return desc || "";
}

function extractCategory(relativePath: string): string {
  const parts = relativePath.split(path.sep);
  const topDir = parts[0] ?? "";

  if (topDir.includes("GetStarted") || topDir.includes("01-GetStarted"))
    return "Get Started";
  if (topDir.includes("MasteryTrack") || topDir.includes("02-MasteryTrack"))
    return "Mastery Track";
  if (
    topDir.includes("ExampleUsecases") ||
    topDir.includes("03-ExampleUsecases") ||
    topDir.includes("10-TodoListTutorial")
  )
    return "Example Use Cases";
  if (topDir.includes("APIReferences") || topDir.includes("04-APIReferences"))
    return "API References";
  if (topDir.includes("Architecture") || topDir.includes("05-Architecture"))
    return "Architecture";
  if (
    topDir.includes("ComponentLibrary") ||
    topDir.includes("06-ComponentLibrary")
  )
    return "Component Library";
  if (topDir.includes("bookofpowerhouse")) return "Book of Powerhouse";
  if (topDir.includes("ReleaseNotes")) return "Release Notes";
  if (topDir.includes("academy")) {
    // Files directly under academy/
    const secondPart = parts[1] ?? "";
    if (secondPart.includes("GetStarted")) return "Get Started";
    if (secondPart.includes("MasteryTrack")) return "Mastery Track";
    if (secondPart.includes("ExampleUsecases")) return "Example Use Cases";
    if (secondPart.includes("APIReferences")) return "API References";
    if (secondPart.includes("Architecture")) return "Architecture";
    if (secondPart.includes("ComponentLibrary")) return "Component Library";
    if (secondPart.includes("bookofpowerhouse")) return "Book of Powerhouse";
    if (secondPart.includes("ReleaseNotes")) return "Release Notes";
  }

  return "Miscellaneous";
}

/**
 * Convert a doc file relative path to its live URL path.
 * Docusaurus strips numeric prefixes (e.g. "01-", "02-") from path segments.
 */
function buildUrlPath(relativePath: string): string {
  const withoutExt = relativePath.replace(/\.(md|mdx)$/, "");
  const segments = withoutExt.split(path.sep);
  const cleaned = segments.map((seg) => seg.replace(/^\d+-/, ""));
  return `${SITE_URL}/${cleaned.join("/")}`;
}

function sortFilesBySidebar(docFiles: DocFile[]): DocFile[] {
  const categoryOrder = [
    "Get Started",
    "Mastery Track",
    "Example Use Cases",
    "API References",
    "Component Library",
    "Architecture",
    "Book of Powerhouse",
    "Release Notes",
    "Miscellaneous",
  ];

  return docFiles.sort((a, b) => {
    const catA = categoryOrder.indexOf(a.category);
    const catB = categoryOrder.indexOf(b.category);
    if (catA !== catB) return catA - catB;
    return a.relativePath.localeCompare(b.relativePath);
  });
}

/**
 * Generate a spec-compliant llms.txt index file.
 * Format: https://llmstxt.org
 */
function generateLLMsIndex(docFiles: DocFile[]): string {
  const sections = new Map<string, DocFile[]>();

  for (const doc of docFiles) {
    if (!sections.has(doc.category)) sections.set(doc.category, []);
    sections.get(doc.category)!.push(doc);
  }

  let output = `# Powerhouse Academy

> Powerhouse is an open-source toolkit for building decentralized applications with document models, real-time collaboration, and scalable network organizations. This documentation covers the full developer journey: getting started, building document models and editors, working with processors and data, deploying packages, and the underlying architecture.
>
> Core npm packages: @powerhousedao/reactor, @powerhousedao/reactor-browser, @powerhousedao/reactor-api, @powerhousedao/codegen, @powerhousedao/builder-tools, @powerhousedao/vetra, @powerhousedao/reactor-attachments, @powerhousedao/reactor-drive
>
> Source: https://github.com/powerhouse-inc/powerhouse — Documentation: https://academy.vetra.io

`;

  for (const [category, files] of sections) {
    output += `## ${category}\n\n`;
    for (const doc of files) {
      const desc = doc.description ? `: ${doc.description}` : "";
      output += `- [${doc.title}](${doc.urlPath})${desc}\n`;
    }
    output += "\n";
  }

  output += `## Optional\n\n`;
  output += `- [llms-full.txt](${SITE_URL}/llms-full.txt): Complete documentation concatenated into a single file for full-context LLM ingestion\n`;

  return output;
}

/**
 * Generate the full-content llms-full.txt file.
 */
function generateLLMsFullContent(docFiles: DocFile[]): string {
  let output = `# Powerhouse Academy - Complete Documentation

> Generated: ${new Date().toISOString()}
> Total Documents: ${docFiles.length}
> Source: ${SITE_URL}/llms-full.txt

`;

  let currentCategory = "";

  for (const doc of docFiles) {
    if (doc.category !== currentCategory) {
      currentCategory = doc.category;
      output += `\n# ${currentCategory}\n\n`;
    }

    output += generateDocSection(doc);
  }

  return output;
}

function generateDocSection(doc: DocFile): string {
  const content = cleanContentForLLMs(doc.content);

  return (
    `\n## ${doc.title}\n\n` +
    `> Source: ${doc.urlPath}\n\n` +
    `${content}\n\n---\n\n`
  );
}

function cleanContentForLLMs(content: string): string {
  return (
    content
      // Strip frontmatter
      .replace(/^---[\s\S]*?---\n/, "")
      // Remove the first heading (we add our own in the section header)
      .replace(/^#\s+.+$/m, "")
      // Strip Docusaurus-specific import statements
      .replace(/^import\s+.+$/gm, "")
      // Convert Docusaurus admonition syntax to plain markers
      .replace(/^:::tip[^\n]*/gm, "**TIP:**")
      .replace(/^:::warning[^\n]*/gm, "**WARNING:**")
      .replace(/^:::info[^\n]*/gm, "**INFO:**")
      .replace(/^:::danger[^\n]*/gm, "**DANGER:**")
      .replace(/^:::note[^\n]*/gm, "**NOTE:**")
      .replace(/^:::[^\n]*/gm, "")
      // Convert relative links to absolute URLs (best-effort)
      .replace(/\]\(\.\/([^)]+)\)/g, "](../docs/$1)")
      .replace(/\]\(\.\.\/([^)]+)\)/g, "](../docs/$1)")
      // Clean up extra whitespace
      .replace(/\n{4,}/g, "\n\n\n")
      .trim()
  );
}

generateLLMDocs();
