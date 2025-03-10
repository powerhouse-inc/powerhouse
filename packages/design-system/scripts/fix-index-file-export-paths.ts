// index.ts
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "fs";
import { dirname, join, resolve } from "path";

interface ExportMatch {
  fullMatch: string;
  path: string;
  startIndex: number;
  endIndex: number;
}

function findExportStatements(content: string): ExportMatch[] {
  // Match both "export * from './path'" and "export { something } from './path'"
  const exportPattern =
    /export\s+(?:\*|(?:{[^}]+}))\s+from\s+['"]([^'"]+)['"]/g;
  const matches: ExportMatch[] = [];

  let match;
  while ((match = exportPattern.exec(content)) !== null) {
    matches.push({
      fullMatch: match[0],
      path: match[1],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  return matches;
}

function processIndexFile(filePath: string): void {
  try {
    const content = readFileSync(filePath, "utf-8");
    const dir = dirname(filePath);
    let modifiedContent = content;
    let offset = 0;

    const exportMatches = findExportStatements(content);

    for (const match of exportMatches) {
      const originalPath = match.path;
      // Preserve the original prefix (./ or ../) by splitting it from the path
      const pathPrefix = /^\.{1,2}\//.exec(originalPath)?.[0] || "";
      const cleanPath = originalPath
        .replace(/^\.{1,2}\//, "")
        .replace(/\/$/, "");
      const fullPath = resolve(dir, cleanPath);

      let newPath: string;

      if (existsSync(`${fullPath}.ts`)) {
        // File exists, change extension to .js
        newPath = `${pathPrefix}${cleanPath}.js`;
      } else if (existsSync(fullPath) && statSync(fullPath).isDirectory()) {
        // It's a directory, point to index.js
        newPath = `${pathPrefix}${cleanPath}/index.js`;
      } else {
        // Path doesn't exist or is not accessible, skip it
        continue;
      }

      // Replace the old path with the new path
      const beforeMatch = modifiedContent.slice(0, match.startIndex + offset);
      const afterMatch = modifiedContent.slice(match.endIndex + offset);
      const newExport = match.fullMatch.replace(originalPath, newPath);

      modifiedContent = beforeMatch + newExport + afterMatch;
      offset += newExport.length - match.fullMatch.length;
    }

    if (content !== modifiedContent) {
      writeFileSync(filePath, modifiedContent);
      console.log(`Updated ${filePath}`);
    }
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error);
  }
}

function processDirectory(dirPath: string): void {
  const ignoreDirs = new Set(["node_modules", "dist", "storybook-static"]);

  try {
    const entries = readdirSync(dirPath);

    for (const entry of entries) {
      const fullPath = join(dirPath, entry);

      try {
        const stats = statSync(fullPath);

        if (stats.isDirectory()) {
          if (!ignoreDirs.has(entry)) {
            processDirectory(fullPath);
          }
        } else if (entry === "index.ts") {
          processIndexFile(fullPath);
        }
      } catch (error) {
        console.error(`Error accessing ${fullPath}:`, error);
      }
    }
  } catch (error) {
    console.error(`Error processing directory ${dirPath}:`, error);
  }
}

// Start processing from the current directory
const startDir = process.argv[2] || ".";
processDirectory(resolve(startDir));
