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

    // Updated regex to capture the entire import statement including any existing type assertion
    const regex =
      /(import|export)[\s\S]*?from\s+['"]([^'"]+)['"](\s*with\s*{\s*type:\s*"json"\s*}\s*)?;?/g;

    // Replace all matches
    const newContent = content.replace(
      regex,
      (match, statement: string, path: string, typeAssertion: string) => {
        // Skip GraphQL files entirely
        if (path.endsWith(".graphql")) {
          return match;
        }

        // Handle JSON imports
        if (path.endsWith(".json")) {
          // If there's already a type assertion, return the original match
          if (typeAssertion) {
            return match;
          }
          // Add type assertion if it's not present
          return `${match.replace(/;?\s*$/, "")} with { type: "json" };`;
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
