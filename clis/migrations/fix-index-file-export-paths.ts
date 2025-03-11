import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "fs";
import { dirname, join, resolve } from "path";

function processFile(filePath: string): void {
  try {
    const content = readFileSync(filePath, "utf-8");

    // Simple regex to match imports and exports
    const regex = /(import|export)[\s\S]*?from\s+['"]([^'"]+)['"]/g;

    // Replace all matches
    const newContent = content.replace(
      regex,
      (match, statement: string, path: string) => {
        // Handle JSON imports
        if (path.endsWith(".json")) {
          // Check if type assertion is already present
          if (!match.includes('with { type: "json" }')) {
            return `${match} with { type: "json" }`;
          }
          return match;
        }

        // Only process relative imports
        if (!path.startsWith(".")) return match;
        // Skip if already has .js extension
        if (path.endsWith(".js")) return match;

        // Add appropriate extension
        const newPath =
          path.endsWith("/") || existsSync(resolve(dirname(filePath), path))
            ? `${path}/index.js`.replace(/\/+/g, "/") // Path is a directory
            : `${path}.js`; // Path is a file

        return match.replace(path, newPath);
      },
    );

    if (content !== newContent) {
      writeFileSync(filePath, newContent);
      console.log(`Updated ${filePath}`);
    }
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error);
  }
}

function processDirectory(dirPath: string): void {
  const ignoreDirs = new Set([
    "node_modules",
    "dist",
    "storybook-static",
    ".git",
  ]);

  try {
    const entries = readdirSync(dirPath);

    for (const entry of entries) {
      if (ignoreDirs.has(entry)) continue;

      const fullPath = join(dirPath, entry);
      const stats = statSync(fullPath);

      if (stats.isDirectory()) {
        processDirectory(fullPath);
      } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
        processFile(fullPath);
      }
    }
  } catch (error) {
    console.error(`Error processing directory ${dirPath}:`, error);
  }
}

// Start processing from the current directory
const startDir = process.argv[2] || ".";
processDirectory(resolve(startDir));
