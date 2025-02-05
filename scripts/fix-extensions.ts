import { readFileSync, writeFileSync } from "fs";
import { glob } from "glob";
import path from "path";

const startDir = process.argv[2] || ".";
const rootDir = process.cwd();
const ALWAYS_IGNORE = ["path"];

// Get all package.json dependencies
function getDependencies(packagePath: string): Set<string> {
  try {
    const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
    return new Set([
      ...Object.keys(pkg.dependencies || {}),
      ...Object.keys(pkg.devDependencies || {}),
      ...Object.keys(pkg.peerDependencies || {}),
      ...Object.keys(pkg.optionalDependencies || {}),
    ]);
  } catch {
    return new Set();
  }
}

// Always include root package.json dependencies
const rootDeps = getDependencies(path.join(rootDir, "package.json"));
const localDeps = getDependencies(path.join(startDir, "package.json"));
const allDeps = new Set([...rootDeps, ...localDeps]);

const files = glob.sync("**/*.{ts,tsx}", {
  ignore: ["**/*.d.ts", "**/node_modules/**"],
  cwd: startDir,
});

files.forEach((file) => {
  const fullPath = path.join(startDir, file);
  let content = readFileSync(fullPath, "utf8");
  content = content.replace(
    /from ['"]([^'"]+)['"]([;\n\r])/g,
    (match, importPath, ending) => {
      if (
        allDeps.has(importPath.split("/")[0]) ||
        importPath.includes(".js") ||
        importPath.startsWith("node:") ||
        importPath.includes("@") ||
        ALWAYS_IGNORE.includes(importPath)
      ) {
        return match;
      }
      return `from "${importPath}.js"${ending}`;
    },
  );
  writeFileSync(fullPath, content);
});
