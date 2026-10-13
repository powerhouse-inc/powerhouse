import fs from "node:fs";
import path from "node:path";
import type { ProjectScanner, ProjectScanResult } from "./types.js";

// Re-export for convenience
export type { ProjectScanResult } from "./types.js";

/**
 * Common project indicator files/dirs. When any of these exist in a folder
 * that isn't matched by the scanner, the folder is treated as a foreign
 * project and its subtree is pruned from the search.
 */
export const PROJECT_INDICATORS = [
  // JS/TS ecosystem
  ".git",
  "package.json",
  "node_modules",
  // Python
  "pyproject.toml",
  "setup.py",
  // Rust
  "Cargo.toml",
  // Go
  "go.mod",
  // Java / Kotlin
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  // .NET
  ".sln",
  // Ruby
  "Gemfile",
  // PHP
  "composer.json",
] as const;

type FolderType = "match" | "mismatch" | "non-project";

function detectType(folderPath: string, scanner: ProjectScanner): FolderType {
  if (scanner.isProjectFolder(folderPath)) return "match";

  for (const indicator of PROJECT_INDICATORS) {
    if (fs.existsSync(path.join(folderPath, indicator))) {
      return "mismatch";
    }
  }

  return "non-project";
}

function enqueueSubdirs(dir: string, queue: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith(".")) {
      queue.push(path.join(dir, entry.name));
    }
  }
}

/**
 * Breadth-first search for project folders starting from `rootDir`.
 *
 * - If root itself matches, returns it immediately.
 * - Otherwise searches subfolders breadth-first:
 *   - Match → added to results, subtree pruned
 *   - Mismatch (foreign project) → subtree pruned
 *   - Non-project → subfolders enqueued for further search
 *
 * Uses `scanner.getProjectName` for the result name (default: `path.basename`),
 * and `scanner.getProjectConfig` when provided.
 */
export function scanProjects(
  rootDir: string,
  scanner: ProjectScanner,
): ProjectScanResult[] {
  const getName = (p: string) =>
    scanner.getProjectName ? scanner.getProjectName(p) : path.basename(p);
  const getConfig = (p: string) =>
    scanner.getProjectConfig ? scanner.getProjectConfig(p) : undefined;

  function toResult(folderPath: string): ProjectScanResult {
    const result: ProjectScanResult = {
      name: getName(folderPath),
      path: folderPath,
      config: getConfig(folderPath),
    };

    if (scanner.getDocumentLink) {
      const link = scanner.getDocumentLink(folderPath);
      if (link) {
        result.documentId = link.documentId;
        result.documentType = link.documentType;
      }
    }

    return result;
  }

  // Check root first
  const rootType = detectType(rootDir, scanner);
  if (rootType === "match") {
    return [toResult(rootDir)];
  }

  const results: ProjectScanResult[] = [];
  const queue: string[] = [];

  enqueueSubdirs(rootDir, queue);

  while (queue.length > 0) {
    const dir = queue.shift()!;
    const type = detectType(dir, scanner);

    switch (type) {
      case "match":
        results.push(toResult(dir));
        break; // prune subtree
      case "mismatch":
        break; // prune subtree
      case "non-project":
        enqueueSubdirs(dir, queue);
        break;
    }
  }

  return results;
}
