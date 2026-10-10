import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";

/**
 * The dependency closure a packed consumer needs, staged before the network
 * is taken away.
 *
 * Installing only the model's tarball proves nothing: `npm install` would go
 * to the network for everything the model depends on, and a consumer that
 * reached the network is not testing what a packed consumer does. So every
 * package the model can reach at runtime is copied in from what this
 * repository already has — workspace packages through a real `npm pack`, so
 * their `files` list and `exports` map are exercised, and third-party
 * packages by copy, so no link points back out of the install directory.
 */

const REPOSITORY_ROOT = resolve(
  dirname(new URL(import.meta.url).pathname),
  "..",
  "..",
  "..",
  "..",
);

/** Packs a workspace package and extracts it where a consumer would find it. */
export function stageWorkspacePackage(
  packageRoot: string,
  into: string,
  tarballRoot: string,
): string {
  const manifest = JSON.parse(
    readFileSync(join(packageRoot, "package.json"), "utf8"),
  ) as { name: string };
  mkdirSync(tarballRoot, { recursive: true });
  const before = new Set(readdirSync(tarballRoot));
  execFileSync(
    "npm",
    ["pack", "--ignore-scripts", "--pack-destination", tarballRoot],
    { cwd: packageRoot, stdio: ["ignore", "pipe", "pipe"] },
  );
  const produced = readdirSync(tarballRoot).filter(
    (entry) => entry.endsWith(".tgz") && !before.has(entry),
  );
  if (produced.length !== 1) {
    throw new Error(
      `packing ${manifest.name} produced ${String(produced.length)} tarballs`,
    );
  }
  const destination = join(into, ...manifest.name.split("/"));
  mkdirSync(destination, { recursive: true });
  execFileSync("tar", [
    "-xzf",
    join(tarballRoot, produced[0]),
    "--strip-components=1",
    "-C",
    destination,
  ]);
  return join(tarballRoot, produced[0]);
}

function packageDirectory(name: string, from: string): string {
  const require = createRequire(join(from, "noop.js"));
  try {
    return dirname(require.resolve(`${name}/package.json`));
  } catch {
    // Not every package exports its own manifest; walk up from its entry.
    let directory = dirname(require.resolve(name));
    while (true) {
      const manifestPath = join(directory, "package.json");
      if (existsSync(manifestPath)) {
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
          name?: string;
        };
        if (manifest.name === name) break;
      }
      const parent = dirname(directory);
      if (parent === directory)
        throw new Error(`Cannot locate the package root for ${name}`);
      directory = parent;
    }
    return directory;
  }
}

/**
 * Copies a package and everything it depends on, dereferencing links.
 *
 * pnpm lays `node_modules` out as links into a store; a consumer holding
 * those links would be resolving files outside its own install directory,
 * which is exactly what the manifest assertion forbids.
 */
export function stageDependencyClosure(
  names: readonly string[],
  from: string,
  into: string,
): readonly string[] {
  const staged = new Set<string>();
  const pending = names.map((name) => ({ name, from }));
  while (pending.length > 0) {
    const entry = pending.pop()!;
    if (staged.has(entry.name)) continue;
    let directory: string;
    try {
      directory = packageDirectory(entry.name, entry.from);
    } catch {
      // An optional or unreachable dependency the runtime never imports.
      continue;
    }
    staged.add(entry.name);
    const destination = join(into, ...entry.name.split("/"));
    if (!existsSync(destination)) {
      mkdirSync(dirname(destination), { recursive: true });
      cpSync(directory, destination, {
        recursive: true,
        dereference: true,
        // A package's own nested node_modules would drag the whole store in;
        // every dependency is staged flat instead, the way a real install
        // lays one out. The path is judged relative to the package root,
        // because a pnpm store path contains `node_modules` above it.
        filter: (source) => {
          const inside = relative(directory, source);
          return inside === "" || !inside.split(sep).includes("node_modules");
        },
      });
    }
    const manifest = JSON.parse(
      readFileSync(join(directory, "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };
    for (const dependency of Object.keys({
      ...manifest.dependencies,
      ...manifest.optionalDependencies,
    })) {
      pending.push({ name: dependency, from: directory });
    }
  }
  return [...staged].sort();
}

export { REPOSITORY_ROOT };

/** The runtime dependencies a workspace package declares. */
export function declaredDependencies(packageRoot: string): readonly string[] {
  const manifest = JSON.parse(
    readFileSync(join(packageRoot, "package.json"), "utf8"),
  ) as { dependencies?: Record<string, string> };
  return Object.keys(manifest.dependencies ?? {}).filter(
    // Workspace packages are staged through a real pack, not copied.
    (name) => !name.startsWith("@powerhousedao/") && name !== "document-model",
  );
}
