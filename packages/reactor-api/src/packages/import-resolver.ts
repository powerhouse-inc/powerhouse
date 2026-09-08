import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Imports a specifier that may be either a bare package specifier or a
 * filesystem path. Absolute paths are converted to file:// URLs, because the
 * ESM loader reads the drive letter in a Windows path as a URL scheme
 * (`import('D:\\...')` fails with ERR_UNSUPPORTED_ESM_URL_SCHEME).
 */
function importSpecifierUrl(target: string): string {
  return path.isAbsolute(target) ? pathToFileURL(target).href : target;
}

async function importSpecifier<T>(target: string): Promise<T> {
  const specifier = importSpecifierUrl(target);
  return (await import(/* @vite-ignore */ specifier)) as T;
}

function barePackageName(specifier: string): string | null {
  if (
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    specifier.includes(":")
  ) {
    return null;
  }
  const segments = specifier.split("/");
  return specifier.startsWith("@")
    ? segments.length >= 2
      ? `${segments[0]}/${segments[1]}`
      : null
    : (segments[0] ?? null);
}

/** True only when Node says the exact attempted import target is absent. */
export function isMissingImportForSpecifier(
  error: unknown,
  target: string,
): error is Error & { code: string } {
  if (!(error instanceof Error) || !("code" in error)) return false;
  const code = String(error.code);
  const specifier = importSpecifierUrl(target);
  const errorUrl =
    "url" in error && typeof error.url === "string" ? error.url : undefined;
  if (
    code === "ERR_UNSUPPORTED_DIR_IMPORT" ||
    code === "ERR_UNSUPPORTED_ESM_URL_SCHEME"
  ) {
    return errorUrl === specifier;
  }
  if (code === "ERR_MODULE_NOT_FOUND") {
    if (errorUrl === specifier) return true;
    if (errorUrl?.endsWith(`/node_modules/${specifier.replace(/^\/+/, "")}`)) {
      return true;
    }
    const packageName = barePackageName(specifier);
    return packageName
      ? error.message.startsWith(`Cannot find package '${packageName}' `) ||
          error.message.startsWith(`Cannot find package "${packageName}" `)
      : false;
  }
  if (code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") return false;

  const packageName = barePackageName(specifier);
  if (!packageName || specifier === packageName) return false;
  const subpath = `.${specifier.slice(packageName.length)}`;
  return (
    error.message.startsWith(`Package subpath '${subpath}' `) ||
    error.message.startsWith(`Package subpath "${subpath}" `)
  );
}

async function importIfPresent<T>(target: string): Promise<T | null> {
  try {
    return await importSpecifier<T>(target);
  } catch (error) {
    if (isMissingImportForSpecifier(error, target)) return null;
    throw error;
  }
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
    const result = await importIfPresent<T>(suggestedPath);
    if (result) return result;
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
  const packageJsonSpecifier = `${packageName}/package.json`;
  try {
    const resolvedUrl = import.meta.resolve?.(packageJsonSpecifier);
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
      const result = await importIfPresent<T>(attemptPath);
      if (result) return result;
    }
  } catch (error) {
    if (!isMissingImportForSpecifier(error, packageJsonSpecifier)) throw error;
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
    const result = await importIfPresent<T>(workspacePath);
    if (result) return result;
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
