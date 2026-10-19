// External dependencies: a package whose code needs a native addon or a
// WebAssembly module cannot be inlined, so it stays a bare import the host installs.
import { readdirSync, readFileSync, realpathSync } from "node:fs";
import { isBuiltin } from "node:module";
import { isAbsolute, join, relative, sep } from "node:path";
import type { InlineConfig } from "tsdown";

/** The files one module needs at run time, and why each was included. */
export type FileTrace = {
  /** Absolute paths. */
  fileList: Set<string>;
  /** Absolute path -> the absolute paths of the files that pulled it in. */
  reasons: Map<string, { parents: Set<string> }>;
};

/** Traces one file: @vercel/nft's nodeFileTrace, handed in by the CLI. */
export type TraceFiles = (file: string) => Promise<FileTrace>;

/** A file the bundle cannot carry: a native addon or a WebAssembly module. */
export type RequiredFile = { file: string; kind: "native" | "wasm" };

export type ExternalDependency = RequiredFile & {
  name: string;
  version: string;
  /** The first of the package's own files seen importing it. */
  importer?: string;
};

/** What one `ph build` learns about packages, shared by all of its builds. */
export type DetectionCache = {
  files: Map<string, Promise<RequiredFile | undefined>>;
  wasm: Map<string, string | undefined>;
};

export const createDetectionCache = (): DetectionCache => ({
  files: new Map(),
  wasm: new Map(),
});

export type ExternalDepsPluginOptions = {
  /** The project root the dirs below are relative to. */
  root?: string;
  /** Browser build: a native package fails it; WebAssembly is bundled. */
  browser?: boolean;
  /** Dirs whose imports the bundler handles as usual: code no host runs. */
  ignoreDirs?: string[];
  /** Dirs that may not import a native or WebAssembly package. */
  forbidDirs?: string[];
  cache?: DetectionCache;
};

type Plugin = NonNullable<InlineConfig["plugins"]>;

type PackageJson = {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

const NODE_MODULES = `${sep}node_modules${sep}`;

/** `file` relative to `root`, with forward slashes on every platform. */
export function projectPath(root: string, file: string): string {
  return relative(root, file).split(sep).join("/");
}

// Windows paths compare case-insensitively, drive letter included.
const samePath = (file: string) =>
  process.platform === "win32" ? file.toLowerCase() : file;

// "@scope/name/sub" -> "@scope/name", "name/sub" -> "name".
export function packageNameOf(specifier: string): string | undefined {
  if (specifier.startsWith(".") || isAbsolute(specifier)) return undefined;
  const parts = specifier.split("/");
  const name = specifier.startsWith("@")
    ? parts.slice(0, 2).join("/")
    : parts[0];
  return name || undefined;
}

// The root of the installed package a file belongs to, if it is in one.
export function packageRootOf(file: string): string | undefined {
  const at = file.lastIndexOf(NODE_MODULES);
  if (at < 0) return undefined;
  const rest = file.slice(at + NODE_MODULES.length).split(sep);
  const depth = rest[0]?.startsWith("@") ? 2 : 1;
  if (rest.length <= depth) return undefined;
  return join(file.slice(0, at + NODE_MODULES.length), ...rest.slice(0, depth));
}

function readPackageJson(root: string): PackageJson | undefined {
  try {
    return JSON.parse(
      readFileSync(join(root, "package.json"), "utf8"),
    ) as PackageJson;
  } catch {
    return undefined;
  }
}

// Only links the importer requires count: an optional peer such as
// ws -> bufferutil is a speed-up the importer runs without.
function requires(importerRoot: string, importedRoot: string): boolean {
  const importer = readPackageJson(importerRoot);
  const name = readPackageJson(importedRoot)?.name;
  if (!importer || !name) return false;
  return (
    importer.dependencies?.[name] !== undefined ||
    importer.optionalDependencies?.[name] !== undefined
  );
}

// The first .wasm file in a package's own files. Presence is enough: most
// packages compute the path or let their caller pass it, so a trace misses it.
function wasmIn(root: string, cache?: DetectionCache): string | undefined {
  if (cache?.wasm.has(root)) return cache.wasm.get(root);
  const found = scanForWasm(root);
  cache?.wasm.set(root, found);
  return found;
}

function scanForWasm(root: string): string | undefined {
  try {
    const found = readdirSync(root, { recursive: true, encoding: "utf8" }).find(
      (file) =>
        file.endsWith(".wasm") && !file.split(sep).includes("node_modules"),
    );
    return found && join(root, found);
  } catch {
    return undefined;
  }
}

/** The first file `entry` cannot load without that a bundle cannot carry. */
export async function findRequiredFile(
  entry: string,
  trace: TraceFiles,
  cache?: DetectionCache,
): Promise<RequiredFile | undefined> {
  const { fileList, reasons } = await trace(entry);
  // A tracer reports real paths, and the entry may sit behind a symlink.
  const start = samePath(realpathSync(entry));
  // What to report, and the traced file the walk back to the entry starts at.
  const candidates: (RequiredFile & { from: string })[] = [...fileList]
    .filter((file) => file.endsWith(".node"))
    .map((file) => ({ file, kind: "native" as const, from: file }));
  {
    const traced = new Map<string, string>();
    for (const file of fileList) {
      const root = packageRootOf(file);
      if (root && !traced.has(root) && /\.[cm]?js$/.test(file)) {
        traced.set(root, file);
      }
    }
    const tracedWasm = [...fileList].filter((file) => file.endsWith(".wasm"));
    for (const [root, from] of traced) {
      const file =
        tracedWasm.find((wasm) => packageRootOf(wasm) === root) ??
        wasmIn(root, cache);
      if (file) candidates.push({ file, kind: "wasm", from });
    }
  }
  for (const { from, ...required } of candidates) {
    // Back to the entry, crossing into a parent's package only when that
    // package requires the one being left.
    const seen = new Set([from]);
    const queue = [from];
    while (queue.length > 0) {
      const file = queue.shift()!;
      if (samePath(file) === start) return required;
      for (const parent of reasons.get(file)?.parents ?? []) {
        if (seen.has(parent)) continue;
        const fromRoot = packageRootOf(parent);
        const toRoot = packageRootOf(file);
        if (
          fromRoot !== toRoot &&
          (!fromRoot || !toRoot || !requires(fromRoot, toRoot))
        ) {
          continue;
        }
        seen.add(parent);
        queue.push(parent);
      }
    }
  }
  return undefined;
}

/** Keeps each package the code imports that needs such a file out of the bundle. */
export function externalDepsPlugin(
  trace: TraceFiles,
  found: Map<string, ExternalDependency>,
  options: ExternalDepsPluginOptions = {},
): Plugin {
  const cache = options.cache ?? createDetectionCache();
  const root = options.root ?? process.cwd();
  const show = (file: string) => projectPath(root, file);
  const inDir = (id: string, dirs: string[] = []) =>
    dirs.some((dir) => show(id).startsWith(`${dir}/`));
  // By resolved file: a package's subpaths can differ in what they load.
  const detect = (id: string) => {
    let verdict = cache.files.get(id);
    if (!verdict) {
      verdict = findRequiredFile(id, trace, cache);
      cache.files.set(id, verdict);
    }
    return verdict;
  };
  return {
    name: "powerhouse:external-deps",
    async resolveId(source, importer, extra) {
      // The project's own imports only: whatever a dependency pulls in goes
      // wherever that dependency goes.
      if (!importer || importer.includes(NODE_MODULES)) return null;
      if (isBuiltin(source) || inDir(importer, options.ignoreDirs)) return null;
      const name = packageNameOf(source);
      if (!name) return null;
      const resolved = await this.resolve(source, importer, {
        ...extra,
        skipSelf: true,
      });
      if (!resolved || resolved.external) return null;
      const required = await detect(resolved.id);
      const pkgRoot = packageRootOf(resolved.id);
      const version = pkgRoot ? readPackageJson(pkgRoot)?.version : undefined;
      if (!required || !version) return null;
      const what =
        required.kind === "native"
          ? `the native addon ${show(required.file)}`
          : `the WebAssembly module ${show(required.file)}`;
      if (options.browser) {
        if (required.kind === "wasm") return null;
        throw new Error(
          `${show(importer)} imports ${name}, which needs ${what}. ` +
            "Native code cannot run in the browser: import it only from subgraphs, switchboard processors or pieces.",
        );
      }
      if (inDir(importer, options.forbidDirs)) {
        throw new Error(
          `${show(importer)} imports ${name}, which needs ${what}. ` +
            "Document models run in Connect and on every host: use it from a subgraph, processor or piece instead.",
        );
      }
      if (!found.has(name)) {
        found.set(name, { name, version, ...required, importer });
      }
      return { id: source, external: true };
    },
  };
}

/**
 * The detected packages `pkg` does not install for its consumers: anything
 * outside dependencies, optionalDependencies and peerDependencies.
 */
export function undeclaredExternalDependencies(
  found: Iterable<ExternalDependency>,
  pkg: Partial<
    Record<
      "dependencies" | "optionalDependencies" | "peerDependencies",
      Partial<Record<string, string>>
    >
  >,
): ExternalDependency[] {
  return [...found].filter(
    (dep) =>
      pkg.dependencies?.[dep.name] === undefined &&
      pkg.optionalDependencies?.[dep.name] === undefined &&
      pkg.peerDependencies?.[dep.name] === undefined,
  );
}

/** name -> version, sorted by name. */
export function externalDependencyVersions(
  found: Iterable<ExternalDependency>,
): Record<string, string> {
  return Object.fromEntries(
    [...found]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((dep) => [dep.name, dep.version]),
  );
}
