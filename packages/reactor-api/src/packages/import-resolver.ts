import path from "node:path";

/**
 * Attempts to import from suggested Node.js paths
 */
async function tryNodeSuggestedPaths<T>(
  packageName: string,
  subPath: string,
): Promise<T | null> {
  const suggestedPaths = [
    `${packageName}/dist/${subPath}/index.js`,
    `${packageName}/dist/${subPath}.js`,
  ];

  for (const suggestedPath of suggestedPaths) {
    try {
      return (await import(/* @vite-ignore */ suggestedPath)) as T;
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

    const packageRoot = path.dirname(new URL(resolvedUrl).pathname);
    const pathsToTry = [
      path.join(packageRoot, "dist", subPath, "index.js"),
      path.join(packageRoot, "dist", `${subPath}.js`),
      path.join(packageRoot, subPath, "index.js"),
      path.join(packageRoot, `${subPath}.js`),
    ];

    for (const attemptPath of pathsToTry) {
      try {
        return (await import(/* @vite-ignore */ attemptPath)) as T;
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
      return (await import(/* @vite-ignore */ workspacePath)) as T;
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
