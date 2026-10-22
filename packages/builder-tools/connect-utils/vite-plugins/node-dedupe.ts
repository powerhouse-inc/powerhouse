import { existsSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

/** `pkg` is installed for `root`: in a node_modules at or above it. */
function installedFor(root: string, pkg: string) {
  for (let dir = root; ; dir = dirname(dir)) {
    if (existsSync(join(dir, "node_modules", pkg, "package.json"))) return true;
    if (dirname(dir) === dir) return false;
  }
}

/** `specifier` names `pkg` or one of its subpaths. */
function names(specifier: string, pkg: string) {
  return specifier === pkg || specifier.startsWith(`${pkg}/`);
}

/**
 * Runs `fn` with Node's resolution of `packages` (and subpaths) pinned to
 * `root`'s copy. Vite's `resolve.dedupe` reaches only what Vite resolves; an
 * SSR-externalized dependency is loaded by Node from its real path, which for
 * a linked checkout is the checkout's node_modules: two Reacts, and the first
 * hook fails with "reading 'useMemo'". A package `root` lacks keeps its usual
 * resolution.
 */
export async function withNodeDedupe<T>(
  root: string,
  packages: readonly string[],
  fn: () => Promise<T>,
): Promise<T> {
  // Decided up front: Node caches a failed resolution under the original
  // request, so a miss at the root could not fall back to the importer's.
  const pinned = packages.filter((pkg) => installedFor(root, pkg));
  if (pinned.length === 0) return fn();
  const rootManifest = join(root, "package.json");
  const parentURL = pathToFileURL(rootManifest).href;
  const rootRequire = createRequire(rootManifest);
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      const pin =
        context.parentURL !== parentURL &&
        pinned.some((pkg) => names(specifier, pkg));
      if (!pin) return nextResolve(specifier, context);
      // require's default step resolves from the calling module, whatever
      // parentURL says, so a CommonJS caller is resolved here.
      if (context.conditions.includes("require")) {
        const url = pathToFileURL(rootRequire.resolve(specifier)).href;
        return { url, shortCircuit: true };
      }
      return nextResolve(specifier, { ...context, parentURL });
    },
  });
  try {
    return await fn();
  } finally {
    hooks.deregister();
  }
}
