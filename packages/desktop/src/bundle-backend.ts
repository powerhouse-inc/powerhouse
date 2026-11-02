import fs from "node:fs";
import path from "node:path";

/**
 * A packaged stack is a node_modules folder, and Windows installs by the file:
 * tens of thousands of them take as long to install as to uninstall, and a
 * start spends most of a cold disk's time reading them. This folds the stack
 * into a few hundred files with Rolldown, in the staged copy only.
 *
 * What's loaded by name keeps working by name. Each package an add-on, a host
 * file or the project's own build may import stays in node_modules with its
 * \`exports\`, and each of those is a Rolldown entry, so an import of
 * \`document-model\` from anywhere reaches the one bundled copy. Two copies would
 * break \`instanceof\` and shared state, and without an error.
 *
 * What's found by path keeps its path. Chunks and the worker scripts go in one
 * package, so a chunk finds \`./entry.mjs\` beside it and the piece worker's walk
 * up to a package.json finds \`dist/worker-entry.js\`.
 */

/** Holds the chunks. A package, so the piece worker's lookup stops at it. */
const CHUNKS_DIR = ".stack";

/** Packages reached by name, by something that isn't in the bundle. */
const BY_NAME = [
  /^@powerhousedao\//,
  /^@renown\/sdk$/,
  /^document-model$/,
  /^graphql$/,
  /^graphql-tag$/,
  /^kysely$/,
  /^zod$/,
];

/**
 * Left as files. PGlite finds its wasm and data beside it. React is what an
 * add-on's editor imports, and a server never calls it. The rest is only loaded
 * on a path a running app never takes, or by a native addon.
 */
const EXTERNAL = [
  /\.node$/,
  /^@electric-sql\/pglite/,
  /^pglite-(legacy|tools)/,
  /^react($|\/)/,
  /^react-dom($|\/)/,
  /^vite($|\/)/,
  /^@powerhousedao\/vetra($|\/)/,
  /^@originjs\//,
  /^devcert$/,
  /^pg-native$/,
  /^bufferutil$/,
  /^utf-8-validate$/,
  /^@pyroscope\//,
];

/** How Rolldown writes a require it can't fold. A plain `require(` in a chunk is
 * text: a package's comments, error messages and generated code. */
const REQUIRE_CALL = /\b__require\(\s*["']([^"']+)["']\s*\)/g;

/** Copied into a kept package as they are, since a path reaches them. */
const KEEP_AS_FILES = [path.join("dist", "node", "pieces")];

type ExportTarget = string | { [condition: string]: ExportTarget } | null;

/** What a package exports for a server: node, then import, then default. */
export function serverTarget(target: ExportTarget | undefined): string | null {
  if (typeof target === "string") return target;
  if (target === null || target === undefined) return null;
  for (const condition of ["node", "import", "default"]) {
    if (condition in target) {
      const found = serverTarget(target[condition]);
      if (found) return found;
    }
  }
  return null;
}

/** Every subpath a package offers a server, with a wildcard's matches listed. */
export function exportedFiles(
  packageDir: string,
  manifest: {
    exports?: Record<string, ExportTarget> | string;
    main?: string;
    module?: string;
  },
): Map<string, string> {
  const files = new Map<string, string>();
  const exports =
    typeof manifest.exports === "string"
      ? { ".": manifest.exports }
      : manifest.exports;
  if (!exports) {
    const main = manifest.module ?? manifest.main ?? "index.js";
    const file = [main, `${main}.js`, path.join(main, "index.js")].find(
      (candidate) => isFile(path.join(packageDir, candidate)),
    );
    if (file) files.set(".", file.replace(/^\.\//, ""));
    return files;
  }
  for (const [subpath, target] of Object.entries(exports)) {
    if (subpath === "./package.json") continue;
    const file = serverTarget(target);
    if (!file) continue;
    if (!subpath.includes("*")) {
      // A package can name a file its server build doesn't have.
      if (isFile(path.join(packageDir, file))) {
        files.set(subpath, file.replace(/^\.\//, ""));
      }
      continue;
    }
    for (const [match, found] of wildcardMatches(packageDir, file)) {
      files.set(subpath.replace("*", match), found);
    }
  }
  return files;
}

function isFile(file: string): boolean {
  return fs.existsSync(file) && fs.statSync(file).isFile();
}

function wildcardMatches(packageDir: string, target: string) {
  const relative = target.replace(/^\.\//, "");
  const [before, after = ""] = relative.split("*");
  const parent = before.endsWith("/") ? before : path.posix.dirname(before);
  const prefix = before.slice(parent.length).replace(/^\//, "");
  const matches: [string, string][] = [];
  const folder = path.join(packageDir, parent);
  if (!fs.existsSync(folder)) return matches;
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const name = entry.name;
    const firstSegment = after.startsWith("/");
    const match = firstSegment
      ? name
      : name.endsWith(after) && name.startsWith(prefix)
        ? name.slice(prefix.length, name.length - after.length)
        : null;
    if (!match) continue;
    const file = path.posix.join(parent, `${prefix}${match}${after}`);
    if (isFile(path.join(packageDir, file))) matches.push([match, file]);
  }
  return matches;
}

/** Where a subpath's entry lands in its package. */
export function entryNameOf(pkg: string, subpath: string): string {
  const name =
    subpath === "."
      ? "index"
      : subpath.replace(/^\.\//, "").replaceAll("/", "__");
  return `${pkg}/${name}`;
}

/** The package.json of a package whose code is now in the bundle. */
export function keptManifest(
  manifest: Record<string, unknown>,
  entries: ReadonlyMap<string, string>,
): Record<string, unknown> {
  const { name, version } = manifest;
  const exports: Record<string, string> = {
    "./package.json": "./package.json",
  };
  for (const [subpath, file] of entries) exports[subpath] = `./${file}`;
  return { name, version, type: "module", exports };
}

interface LockEntry {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  version?: string;
}

/** Nearest install of \`dependency\` as seen from \`from\`, by node's rules. */
function resolveInLock(
  lock: Record<string, LockEntry>,
  from: string,
  dependency: string,
): string | null {
  let at = from;
  for (;;) {
    const candidate = `${at ? `${at}/` : ""}node_modules/${dependency}`;
    if (lock[candidate]) return candidate;
    if (!at) return null;
    const cut = at.lastIndexOf("node_modules/");
    at = cut <= 0 ? "" : at.slice(0, cut - 1);
  }
}

/** The install paths of `names` and everything they depend on. */
export function closureOf(
  lock: Record<string, LockEntry>,
  names: Iterable<string>,
): Set<string> {
  const kept = new Set<string>();
  const queue = [...names]
    .map((name) => `node_modules/${name}`)
    .filter((key) => lock[key]);
  while (queue.length > 0) {
    const key = queue.pop()!;
    if (kept.has(key)) continue;
    kept.add(key);
    const entry = lock[key];
    for (const dependency of Object.keys({
      ...entry.dependencies,
      ...entry.optionalDependencies,
    })) {
      const target = resolveInLock(lock, key, dependency);
      if (target) queue.push(target);
    }
  }
  return kept;
}

/** The package a bare specifier belongs to, or null for a built-in or a path. */
export function packageOf(specifier: string): string | null {
  if (specifier.startsWith(".") || specifier.startsWith("/")) return null;
  if (specifier.startsWith("node:") || /^[a-z]+:/i.test(specifier)) return null;
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

/** One file of every package's licence, as a bundle can't keep them beside
 * the code. Packages under the same text share it. */
function licencesOf(
  modules: string,
  packages: Iterable<string>,
): { text: string; packages: number } {
  const byText = new Map<string, string[]>();
  let count = 0;
  for (const name of packages) {
    const dir = path.join(modules, name);
    if (!fs.existsSync(dir)) continue;
    const files = fs
      .readdirSync(dir)
      .filter(
        (file) =>
          /^(licen[sc]e|copying|notice)/i.test(file) &&
          isFile(path.join(dir, file)),
      )
      .sort();
    const text = files
      .map((file) => fs.readFileSync(path.join(dir, file), "utf8").trim())
      .join("\n\n");
    const manifest = readJson(path.join(dir, "package.json"));
    const label = `${name}@${String(manifest.version ?? "")}`;
    const key =
      text || `License: ${JSON.stringify(manifest.license ?? "unknown")}`;
    byText.set(key, [...(byText.get(key) ?? []), label]);
    count++;
  }
  const sections = [...byText.entries()].map(
    ([text, labels]) => `${labels.join("\n")}\n\n${text}\n`,
  );
  return { text: sections.join(`\n${"-".repeat(72)}\n\n`), packages: count };
}

function readJson(file: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
}

function packagesIn(modules: string): string[] {
  const names: string[] = [];
  for (const entry of fs.readdirSync(modules, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    if (!entry.name.startsWith("@")) {
      names.push(entry.name);
      continue;
    }
    for (const scoped of fs.readdirSync(path.join(modules, entry.name))) {
      names.push(`${entry.name}/${scoped}`);
    }
  }
  return names;
}

/** `__dirname` and `require` per chunk, as a banner collides with any code that
 * declares its own. */
const nodeGlobals = {
  name: "ph:node-globals",
  renderChunk(code: string) {
    const declared = (name: string) =>
      new RegExp(`\\b(?:const|let|var|function)\\s+${name}\\b`).test(code);
    const used = (name: string) =>
      new RegExp(`(?<![.\\w$])${name}\\b`).test(code);
    const wanted = ["__filename", "__dirname", "require"].filter(
      (name) => used(name) && !declared(name),
    );
    if (wanted.length === 0) return null;
    const lines = [`import { fileURLToPath as __ph_path } from "node:url";`];
    if (wanted.includes("__dirname")) {
      lines.push(`import { dirname as __ph_dir } from "node:path";`);
      lines.push(`const __dirname = __ph_dir(__ph_path(import.meta.url));`);
    }
    if (wanted.includes("__filename")) {
      lines.push(`const __filename = __ph_path(import.meta.url);`);
    }
    if (wanted.includes("require")) {
      lines.push(
        `import { createRequire as __ph_require } from "node:module";`,
      );
      lines.push(`const require = __ph_require(import.meta.url);`);
    }
    return { code: `${lines.join("\n")}\n${code}`, map: null };
  },
};

export interface BundleBackendOptions {
  /** A staged stack, with its node_modules installed. */
  stackDir: string;
  logger?: (line: string) => void;
}

export interface BundleBackendResult {
  chunks: number;
  removedPackages: number;
  keptPackages: number;
}

/** Replaces a staged stack's node_modules with a bundle of it. */
export async function bundleBackend(
  options: BundleBackendOptions,
): Promise<BundleBackendResult> {
  const log = options.logger ?? (() => undefined);
  const { stackDir } = options;
  const modules = path.join(stackDir, "node_modules");
  const output = path.join(stackDir, ".bundle-output");
  fs.rmSync(output, { recursive: true, force: true });

  const lock = (
    readJson(path.join(stackDir, "package-lock.json")) as {
      packages: Record<string, LockEntry>;
    }
  ).packages;
  const installed = packagesIn(modules);
  const byName = installed.filter((name) =>
    BY_NAME.some((pattern) => pattern.test(name)),
  );

  const input: Record<string, string> = {};
  const entriesOf = new Map<string, Map<string, string>>();
  const kept = new Map<string, Record<string, unknown>>();
  for (const name of byName) {
    const dir = path.join(modules, name);
    const manifest = readJson(path.join(dir, "package.json"));
    kept.set(name, manifest);
    const entries = new Map<string, string>();
    for (const [subpath, file] of exportedFiles(dir, manifest)) {
      if (!/\.[cm]?js$/.test(file)) continue;
      const entry = entryNameOf(name, subpath);
      input[entry] = path.join(dir, file);
      entries.set(subpath, `${path.posix.basename(entry)}.mjs`);
    }
    entriesOf.set(name, entries);
  }
  const cli = path.join(modules, "@powerhousedao/ph-run/dist/cli.mjs");
  input["@powerhousedao/ph-run/dist/cli"] = cli;
  // Found by path: see the top of this file.
  input[`${CHUNKS_DIR}/entry`] = path.join(
    modules,
    "@powerhousedao/reactor-api/dist/src/pglite/worker/entry.mjs",
  );
  input[`${CHUNKS_DIR}/dist/worker-entry`] = path.join(
    modules,
    "@powerhousedao/reactor-workflow/dist/worker-entry.js",
  );
  for (const [entry, file] of Object.entries(input)) {
    if (!fs.existsSync(file)) throw new Error(`no entry ${entry} at ${file}`);
  }
  log(
    `  bundling ${Object.keys(input).length} entries of ${byName.length} packages…`,
  );

  const { rolldown } = await import("rolldown");
  const build = await rolldown({
    cwd: stackDir,
    input,
    platform: "node",
    external: EXTERNAL,
    onLog() {
      // Rolldown's warnings about the packages it folds are nobody's to fix.
    },
    plugins: [nodeGlobals],
  });
  const { output: written } = await build.write({
    dir: output,
    format: "esm",
    entryFileNames: (chunk) =>
      chunk.name === `${CHUNKS_DIR}/dist/worker-entry`
        ? `${CHUNKS_DIR}/dist/worker-entry.js`
        : "[name].mjs",
    chunkFileNames: `${CHUNKS_DIR}/[name]-[hash].mjs`,
    // A piece is told from other exports by its constructor's name.
    keepNames: true,
    sourcemap: false,
  });
  await build.close();

  // Whatever stays external has to stay installed, with what it needs.
  const ownFiles = new Set(written.map((file) => file.fileName));
  const reached = new Set<string>();
  for (const file of written) {
    if (file.type !== "chunk") continue;
    for (const specifier of [...file.imports, ...file.dynamicImports]) {
      const name = ownFiles.has(specifier) ? null : packageOf(specifier);
      if (name) reached.add(name);
    }
    // A require() a package's own build left in is a string to Rolldown.
    for (const [, specifier] of file.code.matchAll(REQUIRE_CALL)) {
      const name = packageOf(specifier);
      if (name && lock[`node_modules/${name}`]) reached.add(name);
    }
  }
  log(`  left as files: ${[...reached].sort().join(", ")}`);
  const keepInstalled = closureOf(lock, reached);
  const bundled = new Set(byName);

  const removed = installed.filter(
    (name) => !keepInstalled.has(`node_modules/${name}`) && !bundled.has(name),
  );
  const licences = licencesOf(modules, [...removed, ...byName]);
  fs.writeFileSync(
    path.join(stackDir, "THIRD-PARTY-LICENSES.txt"),
    licences.text,
  );

  for (const name of byName) {
    const dir = path.join(modules, name);
    const staged = path.join(output, name);
    fs.mkdirSync(staged, { recursive: true });
    for (const relative of KEEP_AS_FILES) {
      const from = path.join(dir, relative);
      if (fs.existsSync(from)) {
        fs.cpSync(from, path.join(staged, relative), { recursive: true });
      }
    }
    for (const file of fs.readdirSync(dir)) {
      const from = path.join(dir, file);
      if (/\.json$/.test(file) && file !== "package.json" && isFile(from)) {
        fs.copyFileSync(from, path.join(staged, file));
      }
    }
    const manifest = kept.get(name) ?? {};
    const entries = entriesOf.get(name) ?? new Map<string, string>();
    for (const [subpath, file] of exportedFiles(dir, manifest as never)) {
      if (/\.[cm]?js$/.test(file)) continue;
      const target = path.join(staged, file);
      if (!isFile(path.join(dir, file))) continue;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(dir, file), target);
      entries.set(subpath, file);
    }
    fs.writeFileSync(
      path.join(staged, "package.json"),
      `${JSON.stringify(keptManifest(manifest, entries), null, 2)}\n`,
    );
  }
  fs.writeFileSync(
    path.join(output, CHUNKS_DIR, "package.json"),
    `${JSON.stringify({ name: "ph-stack-bundle", private: true, type: "module" })}\n`,
  );

  for (const name of [...removed, ...byName]) {
    fs.rmSync(path.join(modules, name), { recursive: true, force: true });
  }
  fs.rmSync(path.join(modules, ".bin"), { recursive: true, force: true });
  for (const entry of fs.readdirSync(modules, { withFileTypes: true })) {
    if (!entry.name.startsWith("@") || !entry.isDirectory()) continue;
    const scope = path.join(modules, entry.name);
    if (fs.readdirSync(scope).length === 0) fs.rmdirSync(scope);
  }
  fs.cpSync(output, modules, { recursive: true });
  fs.rmSync(output, { recursive: true, force: true });

  const chunks = written.filter((file) => file.type === "chunk").length;
  log(
    `  bundled into ${chunks} files; ${removed.length} packages folded in, ${reached.size} left as files, licences of ${licences.packages} written`,
  );
  return {
    chunks,
    removedPackages: removed.length,
    keptPackages: keepInstalled.size,
  };
}
