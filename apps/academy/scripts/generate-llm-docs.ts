import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

interface DocFile {
  path: string;
  content: string;
  relativePath: string;
  title: string;
  category: string;
}

interface SidebarItem {
  type: string;
  label?: string;
  id?: string;
  items?: SidebarItem[];
  dirName?: string;
}

/**
 * Generates a comprehensive LLM-optimized markdown file from all academy documentation
 */
async function generateLLMDocs() {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    // Define paths
    const academyDocsDir = path.resolve(__dirname, "..", "docs");
    const outputFile = path.resolve(__dirname, "..", "academy_LLM_docs.md");
    const staticOutputFile = path.resolve(
      __dirname,
      "..",
      "static",
      "academy_LLM_docs.md",
    );
    const sidebarPath = path.resolve(__dirname, "..", "sidebars.ts");

    // Read and parse sidebar structure
    const sidebarContent = fs.readFileSync(sidebarPath, "utf8");
    const sidebar = extractSidebarStructure(sidebarContent);

    // Collect all markdown files
    const docFiles = await collectDocFiles(academyDocsDir);

    // Sort files according to sidebar structure
    const sortedFiles = sortFilesBySidebar(docFiles, sidebar);

    // Generate comprehensive markdown
    const comprehensiveMarkdown = generateComprehensiveMarkdown(sortedFiles);

    // Write to both output files
    fs.writeFileSync(outputFile, comprehensiveMarkdown);
    fs.writeFileSync(staticOutputFile, comprehensiveMarkdown);

    console.log(`✅ LLM-optimized documentation generated at: ${outputFile}`);
    console.log(`🌐 Static file available at: ${staticOutputFile}`);
    console.log(`📊 Combined ${sortedFiles.length} documentation files`);
    console.log(
      `📝 Output size: ${Math.round(comprehensiveMarkdown.length / 1024)}KB`,
    );
    console.log(`🔗 URL: https://academy.vetra.io/academy_LLM_docs.md`);
  } catch (error) {
    console.error("Failed to generate LLM documentation:", error);
    process.exit(1);
  }
}

/**
 * Extract sidebar structure from sidebars.ts file
 */
function extractSidebarStructure(sidebarContent: string): SidebarItem[] {
  // Simple extraction - could be enhanced with proper AST parsing
  const academySidebarMatch = sidebarContent.match(
    /academySidebar:\s*\[([\s\S]*?)\],?\s*};/,
  );
  if (!academySidebarMatch) {
    console.warn("Could not parse sidebar structure, using file system order");
    return [];
  }
  return []; // Simplified for now - would need proper parsing
}

/**
 * Recursively collect all markdown files
 */
async function collectDocFiles(docsDir: string): Promise<DocFile[]> {
  const docFiles: DocFile[] = [];

  function collectFiles(dir: string) {
    const items = fs.readdirSync(dir);

    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        collectFiles(fullPath);
      } else if (item.endsWith(".md")) {
        const content = fs.readFileSync(fullPath, "utf8");
        const relativePath = path.relative(docsDir, fullPath);
        const title = extractTitle(content, relativePath);
        const category = extractCategory(relativePath);

        docFiles.push({
          path: fullPath,
          content,
          relativePath,
          title,
          category,
        });
      }
    }
  }

  collectFiles(docsDir);
  return docFiles;
}

/**
 * Extract title from markdown content
 */
function extractTitle(content: string, relativePath: string): string {
  // Try to extract from first # heading
  const titleMatch = content.match(/^#\s+(.+)$/m);
  if (titleMatch) {
    return titleMatch[1].trim();
  }

  // Fallback to filename
  return path.basename(relativePath, ".md");
}

/**
 * Extract category from file path
 */
function extractCategory(relativePath: string): string {
  const pathParts = relativePath.split(path.sep);

  if (pathParts.includes("GetStarted")) return "Get Started";
  if (pathParts.includes("MasteryTrack")) return "Mastery Track";
  if (pathParts.includes("ExampleUsecases")) return "Example Use Cases";
  if (pathParts.includes("APIReferences")) return "API References";
  if (pathParts.includes("Architecture")) return "Architecture";
  if (pathParts.includes("ComponentLibrary")) return "Component Library";
  if (pathParts.includes("bookofpowerhouse")) return "Book of Powerhouse";

  return "Miscellaneous";
}

/**
 * Sort files according to sidebar structure (simplified version)
 */
function sortFilesBySidebar(
  docFiles: DocFile[],
  sidebar: SidebarItem[],
): DocFile[] {
  // For now, sort by category and then by title
  return docFiles.sort((a, b) => {
    if (a.category !== b.category) {
      const categoryOrder = [
        "Get Started",
        "Mastery Track",
        "Example Use Cases",
        "API References",
        "Component Library",
        "Architecture",
        "Book of Powerhouse",
        "Miscellaneous",
      ];
      return (
        categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category)
      );
    }
    return a.title.localeCompare(b.title);
  });
}

/**
 * Generate comprehensive markdown optimized for LLMs
 */
function generateComprehensiveMarkdown(docFiles: DocFile[]): string {
  let markdown = `# Powerhouse Academy - Complete Documentation

> **LLM-Optimized Documentation**  
> Generated: ${new Date().toISOString()}  
> Total Documents: ${docFiles.length}  
> Purpose: Comprehensive reference for AI systems  

## Table of Contents

${generateTableOfContents(docFiles)}

---

## Document Structure

This documentation is organized into the following categories:

${generateCategoryOverview(docFiles)}

---

`;

  let currentCategory = "";

  for (const docFile of docFiles) {
    // Add category header if changed
    if (docFile.category !== currentCategory) {
      currentCategory = docFile.category;
      markdown += `\n# ${currentCategory}\n\n`;
    }

    // Add document
    markdown += generateDocumentSection(docFile);
  }

  // Add footer with metadata
  markdown += `\n---\n\n## Documentation Metadata

**Source Repository:** Powerhouse Academy  
**Last Generated:** ${new Date().toISOString()}  
**Total Sections:** ${docFiles.length}  
**Categories:** ${Array.from(new Set(docFiles.map((f) => f.category))).join(", ")}  

**LLM Optimization Features:**
- ✅ Structured headings and hierarchy
- ✅ Table of contents with internal links  
- ✅ Category-based organization
- ✅ Code examples with syntax highlighting
- ✅ Cross-references and relationships
- ✅ Comprehensive API documentation
- ✅ Tutorial sequences and workflows

`;

  return markdown;
}

/**
 * Generate table of contents
 */
function generateTableOfContents(docFiles: DocFile[]): string {
  const toc: string[] = [];
  let currentCategory = "";

  for (const docFile of docFiles) {
    if (docFile.category !== currentCategory) {
      currentCategory = docFile.category;
      toc.push(`\n### ${currentCategory}`);
    }

    const anchor = generateAnchor(docFile.title);
    toc.push(`- [${docFile.title}](#${anchor})`);
  }

  return toc.join("\n");
}

/**
 * Generate category overview
 */
function generateCategoryOverview(docFiles: DocFile[]): string {
  const categories = new Map<string, DocFile[]>();

  for (const docFile of docFiles) {
    if (!categories.has(docFile.category)) {
      categories.set(docFile.category, []);
    }
    categories.get(docFile.category)!.push(docFile);
  }

  const overview: string[] = [];
  for (const [category, files] of categories) {
    overview.push(
      `**${category}** (${files.length} documents) - ${getCategoryDescription(category)}`,
    );
  }

  return overview.join("\n\n");
}

/**
 * Get category description
 */
function getCategoryDescription(category: string): string {
  const descriptions: Record<string, string> = {
    "Get Started": "Essential tutorials and quick start guides for new users",
    "Mastery Track":
      "Advanced guides for building production-ready applications",
    "Example Use Cases": "Practical examples and real-world implementations",
    "API References": "Complete API documentation and technical references",
    "Component Library": "UI components and design system documentation",
    Architecture: "System architecture and core concepts",
    "Book of Powerhouse":
      "Comprehensive philosophy and framework documentation",
    Miscellaneous: "Additional resources and supplementary information",
  };

  return descriptions[category] || "Additional documentation";
}

/**
 * Generate document section
 */
function generateDocumentSection(docFile: DocFile): string {
  const anchor = generateAnchor(docFile.title);
  let content = docFile.content;

  // Clean up content for LLM optimization
  content = optimizeContentForLLM(content);

  return (
    `\n## ${docFile.title} {#${anchor}}\n\n` +
    `**Source:** \`${docFile.relativePath}\`  \n` +
    `**Category:** ${docFile.category}  \n\n` +
    `${content}\n\n---\n\n`
  );
}

/**
 * Optimize content for LLM consumption
 */
function optimizeContentForLLM(content: string): string {
  return (
    content
      // Remove existing title (we add our own)
      .replace(/^#\s+.+$/m, "")
      // Convert relative links to descriptive text
      .replace(/\]\(\.\/([^)]+)\)/g, "] (see: $1)")
      .replace(/\]\(\.\.\/([^)]+)\)/g, "] (see: $1)")
      // Enhance code blocks with context
      .replace(/```(\w+)\n/g, "```$1\n// $1 code example:\n")
      // Add semantic markers for important sections
      .replace(/^:::tip/gm, "**💡 TIP:**")
      .replace(/^:::warning/gm, "**⚠️ WARNING:**")
      .replace(/^:::info/gm, "**ℹ️ INFO:**")
      .replace(/^:::danger/gm, "**🚨 DANGER:**")
      .replace(/^:::/gm, "")
      // Clean up extra whitespace
      .replace(/\n{4,}/g, "\n\n\n")
      .trim()
  );
}

/**
 * Generate URL-safe anchor
 */
function generateAnchor(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// Run the script
generateLLMDocs();
