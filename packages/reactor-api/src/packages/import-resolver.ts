import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Imports a specifier that may be either a bare package specifier or a
 * filesystem path. Absolute paths are converted to file:// URLs, because the
 * ESM loader reads the drive letter in a Windows path as a URL scheme
 * (`import('D:\\...')` fails with ERR_UNSUPPORTED_ESM_URL_SCHEME).
 */
async function importSpecifier<T>(target: string): Promise<T> {
  const specifier = path.isAbsolute(target)
    ? pathToFileURL(target).href
    : target;
  return (await import(/* @vite-ignore */ specifier)) as T;
}

/**
 * Attempts to import from suggested Node.js paths
 */
async function tryNodeSuggestedPaths<T>(
  packageName: string,
  subPath: string,
): Promise<T | null> {
  const suggestedPaths = [
    `${packageName}/dist/node/${subPath}/index.mjs`,
    `${packageName}/dist/node/${subPath}.mjs`,
    `${packageName}/dist/${subPath}/index.js`,
    `${packageName}/dist/${subPath}.js`,
  ];

  for (const suggestedPath of suggestedPaths) {
    try {
      return await importSpecifier<T>(suggestedPath);
    } catch {
      // Continue to next attempt
    }
  }

  return null;
}

/**
 * Attempts to resolve package using import.meta.resolve
 */
async function tryImportMetaResolve<T>(
  packageName: string,
  subPath: string,
): Promise<T | null> {
  try {
    const resolvedUrl = import.meta.resolve?.(`${packageName}/package.json`);
    if (!resolvedUrl) return null;

    // fileURLToPath, not URL.pathname: the latter yields "/D:/..." on Windows.
    const packageRoot = path.dirname(fileURLToPath(resolvedUrl));
    const pathsToTry = [
      path.join(packageRoot, "dist", "node", subPath, "index.mjs"),
      path.join(packageRoot, "dist", "node", `${subPath}.mjs`),
      path.join(packageRoot, "dist", subPath, "index.js"),
      path.join(packageRoot, "dist", `${subPath}.js`),
      path.join(packageRoot, subPath, "index.js"),
      path.join(packageRoot, `${subPath}.js`),
    ];

    for (const attemptPath of pathsToTry) {
      try {
        return await importSpecifier<T>(attemptPath);
      } catch {
        // Continue to next attempt
      }
    }
  } catch {
    // import.meta.resolve failed
  }

  return null;
}

/**
 * Resolves symlinks in node_modules to find the real package location
 */
async function resolveSymlinkedPaths(
  packageName: string,
  subPath: string,
): Promise<string[]> {
  const packageBaseName = packageName.includes("/")
    ? packageName.split("/").pop()
    : packageName;
  const nodeModulesPatterns = [
    path.join(process.cwd(), "node_modules", packageName),
    path.join(process.cwd(), "node_modules", packageBaseName || packageName),
  ];

  const workspacePatterns: string[] = [];

  for (const nodeModulesPath of nodeModulesPatterns) {
    try {
      const fs = await import("node:fs");
      if (fs.existsSync(nodeModulesPath)) {
        const realPath = fs.realpathSync(nodeModulesPath);

        workspacePatterns.push(
          path.join(realPath, "dist", "node", subPath, "index.mjs"),
          path.join(realPath, "dist", "node", `${subPath}.mjs`),
          path.join(realPath, "dist", subPath, "index.js"),
          path.join(realPath, "dist", `${subPath}.js`),
          path.join(realPath, subPath, "index.js"),
          path.join(realPath, `${subPath}.js`),
        );
      }
    } catch {
      // Continue to next attempt
    }
  }

  return workspacePatterns;
}

/**
 * Generates common workspace pattern paths
 */
function getCommonWorkspacePaths(
  packageName: string,
  subPath: string,
): string[] {
  const packageBaseName = packageName.includes("/")
    ? packageName.split("/").pop()
    : packageName;
  const commonRoots = [process.cwd(), path.dirname(process.cwd())];

  const workspacePatterns: string[] = [];
  for (const root of commonRoots) {
    workspacePatterns.push(
      path.join(
        root,
        "packages",
        packageBaseName || packageName,
        "dist",
        "node",
        subPath,
        "index.mjs",
      ),
      path.join(
        root,
        "packages",
        packageBaseName || packageName,
        "dist",
        "node",
        `${subPath}.mjs`,
      ),
      path.join(
        root,
        "packages",
        packageBaseName || packageName,
        "dist",
        subPath,
        "index.js",
      ),
      path.join(
        root,
        "packages",
        packageBaseName || packageName,
        "dist",
        `${subPath}.js`,
      ),
    );
  }

  return workspacePatterns;
}

/**
 * Attempts to import from a list of workspace patterns
 */
async function tryWorkspacePatterns<T>(patterns: string[]): Promise<T | null> {
  for (const workspacePath of patterns) {
    try {
      return await importSpecifier<T>(workspacePath);
    } catch {
      // Continue to next attempt
    }
  }

  return null;
}

/**
 * Attempts to resolve linked packages using various fallback strategies
 */
export async function resolveLinkedPackage<T>(
  packageName: string,
  subPath: string,
): Promise<T | null> {
  // Try Node.js suggested paths first
  let result = await tryNodeSuggestedPaths<T>(packageName, subPath);
  if (result) return result;

  // Try import.meta.resolve
  result = await tryImportMetaResolve<T>(packageName, subPath);
  if (result) return result;

  // Try symlink resolution
  const symlinkPaths = await resolveSymlinkedPaths(packageName, subPath);
  result = await tryWorkspacePatterns<T>(symlinkPaths);
  if (result) return result;

  // Try common workspace patterns as final fallback
  const commonPaths = getCommonWorkspacePaths(packageName, subPath);
  result = await tryWorkspacePatterns<T>(commonPaths);
  if (result) return result;

  return null;
}
