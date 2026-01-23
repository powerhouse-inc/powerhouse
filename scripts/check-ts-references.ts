#!/usr/bin/env tsx
/**
 * Validates and fixes tsconfig.json references based on package.json workspace dependencies.
 *
 * Usage:
 *   tsx scripts/check-ts-references.ts         # Check for missing references
 *   tsx scripts/check-ts-references.ts --fix   # Auto-fix missing references
 */

import { glob } from "glob";
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT_DIR = path.resolve(import.meta.dirname, "..");

/**
 * Parse JSONC (JSON with comments and trailing commas) - commonly used in tsconfig.json
 * This is a simplified parser that handles trailing commas and basic comments.
 */
function parseJsonc(content: string): unknown {
  let result = "";
  let i = 0;
  let inString = false;
  let escape = false;

  while (i < content.length) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (escape) {
      result += char;
      escape = false;
      i++;
      continue;
    }

    if (char === "\\" && inString) {
      result += char;
      escape = true;
      i++;
      continue;
    }

    if (char === '"' && !escape) {
      inString = !inString;
      result += char;
      i++;
      continue;
    }

    if (!inString) {
      // Check for single-line comment
      if (char === "/" && nextChar === "/") {
        // Skip until end of line
        while (i < content.length && content[i] !== "\n") {
          i++;
        }
        continue;
      }

      // Check for multi-line comment
      if (char === "/" && nextChar === "*") {
        i += 2; // Skip /*
        // Skip until */
        while (i < content.length - 1) {
          if (content[i] === "*" && content[i + 1] === "/") {
            i += 2; // Skip */
            break;
          }
          i++;
        }
        continue;
      }
    }

    result += char;
    i++;
  }

  // Remove trailing commas before } or ]
  result = result.replace(/,(\s*[}\]])/g, "$1");

  return JSON.parse(result);
}

interface TsConfig {
  references?: Array<{ path: string }>;
  [key: string]: unknown;
}

interface PackageJson {
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

interface ValidationResult {
  packagePath: string;
  packageName: string;
  missingRefs: Array<{ name: string; relativePath: string }>;
}

function parseWorkspacePatterns(): string[] {
  const workspaceYamlPath = path.join(ROOT_DIR, "pnpm-workspace.yaml");
  const content = fs.readFileSync(workspaceYamlPath, "utf-8");

  // Simple YAML parser for pnpm-workspace.yaml format:
  // packages:
  //   - "pattern1"
  //   - "pattern2"
  const patterns: string[] = [];
  const lines = content.split("\n");
  let inPackages = false;

  for (const line of lines) {
    if (line.trim() === "packages:") {
      inPackages = true;
      continue;
    }
    if (inPackages && line.trim().startsWith("-")) {
      // Extract pattern from - "pattern" or - 'pattern' or - pattern
      const match = line.match(/^\s*-\s*["']?([^"']+)["']?\s*$/);
      if (match) {
        patterns.push(match[1].trim());
      }
    }
  }

  return patterns;
}

async function discoverWorkspacePackages(): Promise<Map<string, string>> {
  const patterns = parseWorkspacePatterns();
  const packageNameToPath = new Map<string, string>();

  for (const pattern of patterns) {
    const packageJsonPattern = path.join(ROOT_DIR, pattern, "package.json");
    const packageJsonPaths = await glob(packageJsonPattern, {
      absolute: true,
      ignore: ["**/node_modules/**"],
    });

    for (const packageJsonPath of packageJsonPaths) {
      try {
        const content = fs.readFileSync(packageJsonPath, "utf-8");
        const packageJson: PackageJson = JSON.parse(content);
        if (packageJson.name) {
          const packageDir = path.dirname(packageJsonPath);
          packageNameToPath.set(packageJson.name, packageDir);
        }
      } catch {
        // Skip packages with invalid package.json
      }
    }
  }

  return packageNameToPath;
}

function getWorkspaceDependencies(packageJson: PackageJson): string[] {
  const deps: string[] = [];
  const allDeps = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
    ...packageJson.peerDependencies,
    ...packageJson.optionalDependencies,
  };

  for (const [name, version] of Object.entries(allDeps)) {
    if (version.startsWith("workspace:")) {
      deps.push(name);
    }
  }

  return deps;
}

function getTsConfigReferences(tsConfigPath: string): Set<string> {
  const refs = new Set<string>();

  try {
    const content = fs.readFileSync(tsConfigPath, "utf-8");
    const tsConfig = parseJsonc(content) as TsConfig;

    if (tsConfig.references) {
      for (const ref of tsConfig.references) {
        // Normalize the path
        const absPath = path.resolve(path.dirname(tsConfigPath), ref.path);
        refs.add(absPath);
      }
    }
  } catch {
    // Return empty set if tsconfig doesn't exist or is invalid
  }

  return refs;
}

function validatePackage(
  packageDir: string,
  packageNameToPath: Map<string, string>,
): ValidationResult | null {
  const packageJsonPath = path.join(packageDir, "package.json");
  const tsConfigPath = path.join(packageDir, "tsconfig.json");

  // Skip packages without tsconfig.json
  if (!fs.existsSync(tsConfigPath)) {
    return null;
  }

  // Skip packages without package.json
  if (!fs.existsSync(packageJsonPath)) {
    return null;
  }

  const packageJson: PackageJson = JSON.parse(
    fs.readFileSync(packageJsonPath, "utf-8"),
  );
  const workspaceDeps = getWorkspaceDependencies(packageJson);
  const currentRefs = getTsConfigReferences(tsConfigPath);

  const missingRefs: Array<{ name: string; relativePath: string }> = [];

  for (const depName of workspaceDeps) {
    const depPath = packageNameToPath.get(depName);
    if (!depPath) {
      // Dependency is not in workspace (maybe external)
      continue;
    }

    // Check if the dependency has a tsconfig.json (only add reference if it does)
    const depTsConfigPath = path.join(depPath, "tsconfig.json");
    if (!fs.existsSync(depTsConfigPath)) {
      continue;
    }

    // Check if reference already exists
    if (!currentRefs.has(depPath)) {
      const relativePath = path.relative(packageDir, depPath);
      missingRefs.push({ name: depName, relativePath });
    }
  }

  if (missingRefs.length === 0) {
    return null;
  }

  return {
    packagePath: packageDir,
    packageName: packageJson.name,
    missingRefs,
  };
}

function fixTsConfig(
  packageDir: string,
  missingRefs: Array<{ name: string; relativePath: string }>,
): void {
  const tsConfigPath = path.join(packageDir, "tsconfig.json");
  const content = fs.readFileSync(tsConfigPath, "utf-8");
  const tsConfig = parseJsonc(content) as TsConfig;

  if (!tsConfig.references) {
    tsConfig.references = [];
  }

  for (const ref of missingRefs) {
    tsConfig.references.push({ path: ref.relativePath });
  }

  // Write back with 2-space indentation to match typical formatting
  fs.writeFileSync(tsConfigPath, JSON.stringify(tsConfig, null, 2) + "\n");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const shouldFix = args.includes("--fix");

  console.log("Validating tsconfig.json references...\n");

  const packageNameToPath = await discoverWorkspacePackages();
  const issues: ValidationResult[] = [];

  for (const packageDir of packageNameToPath.values()) {
    const result = validatePackage(packageDir, packageNameToPath);
    if (result) {
      issues.push(result);
    }
  }

  if (issues.length === 0) {
    console.log("All tsconfig.json references are valid.");
    process.exit(0);
  }

  for (const issue of issues) {
    const relativePackagePath = path.relative(ROOT_DIR, issue.packagePath);
    console.log(`${relativePackagePath}:`);
    for (const ref of issue.missingRefs) {
      console.log(`  Missing reference: ${ref.name} (${ref.relativePath})`);
    }

    if (shouldFix) {
      fixTsConfig(issue.packagePath, issue.missingRefs);
      console.log(`  Fixed!\n`);
    } else {
      console.log("");
    }
  }

  const totalMissing = issues.reduce(
    (sum, issue) => sum + issue.missingRefs.length,
    0,
  );

  if (shouldFix) {
    console.log(
      `Fixed ${totalMissing} missing reference(s) in ${issues.length} package(s).`,
    );
    process.exit(0);
  } else {
    console.log(
      `Found ${totalMissing} missing reference(s) in ${issues.length} package(s).`,
    );
    console.log("Run with --fix to automatically add missing references.");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
