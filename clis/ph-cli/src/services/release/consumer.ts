import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import type { PackedManifest, PackedRelease } from "./pack.js";

type Consumer = "node" | "browser";

const CONDITIONS: Readonly<Record<Consumer, ReadonlySet<string>>> = {
  node: new Set(["node", "import", "module-sync", "default"]),
  browser: new Set(["browser", "import", "module", "default"]),
};

const IMPORTABLE = /\.(m?js|cjs)$/;

function resolveTarget(
  value: unknown,
  conditions: ReadonlySet<string>,
): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const target = resolveTarget(item, conditions);
      if (target !== undefined) return target;
    }
    return undefined;
  }
  if (value === null || typeof value !== "object") return undefined;
  for (const [key, nested] of Object.entries(value)) {
    if (!conditions.has(key)) continue;
    const target = resolveTarget(nested, conditions);
    if (target !== undefined) return target;
  }
  return undefined;
}

function targetsOf(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(targetsOf);
  if (value === null || typeof value !== "object") return [];
  return Object.values(value).flatMap(targetsOf);
}

function subpaths(manifest: PackedManifest): [string, unknown][] {
  const { exports } = manifest;
  if (exports === undefined) return [];
  if (
    exports !== null &&
    typeof exports === "object" &&
    !Array.isArray(exports) &&
    Object.keys(exports).some((key) => key.startsWith("."))
  ) {
    return Object.entries(exports);
  }
  return [[".", exports]];
}

const packedPath = (target: string) => target.replace(/^\.\//, "");

export function packedEntries(
  manifest: PackedManifest,
  files: ReadonlySet<string>,
  unbuilt: ReadonlySet<string>,
): {
  readonly imports: Record<Consumer, string[]>;
  readonly missing: string[];
} {
  const imports: Record<Consumer, string[]> = { node: [], browser: [] };
  const missing: string[] = [];
  const entries = subpaths(manifest);
  if (entries.length === 0) {
    imports.node.push(manifest.name);
    return { imports, missing };
  }
  for (const [subpath, value] of entries) {
    const targets = targetsOf(value).filter((target) => !target.includes("*"));
    const absent = targets.filter((target) => !files.has(packedPath(target)));
    if (unbuilt.has(subpath) && absent.length === targets.length) continue;
    missing.push(
      ...absent.map((target) => `exports["${subpath}"] names ${target}`),
    );
    if (subpath === "./package.json") continue;
    for (const consumer of ["node", "browser"] as const) {
      const target = resolveTarget(value, CONDITIONS[consumer]);
      if (target === undefined || !IMPORTABLE.test(target)) continue;
      const specifier = `${manifest.name}${subpath.slice(1)}`;
      if (!subpath.includes("*")) {
        imports[consumer].push(specifier);
        continue;
      }
      const [before, after] = packedPath(target).split("*");
      const [subBefore, subAfter] = specifier.split("*");
      for (const file of [...files].sort()) {
        if (!file.startsWith(before) || !file.endsWith(after)) continue;
        const star = file.slice(before.length, file.length - after.length);
        if (star !== "")
          imports[consumer].push(`${subBefore}${star}${subAfter}`);
      }
    }
  }
  return { imports, missing };
}

function installed(projectRoot: string, name: string): string | undefined {
  for (let directory = projectRoot; ; directory = dirname(directory)) {
    const candidate = join(directory, "node_modules", ...name.split("/"));
    if (existsSync(join(candidate, "package.json"))) {
      return realpathSync.native(candidate);
    }
    if (dirname(directory) === directory) return undefined;
  }
}

// Imports each specifier, writes the failures to the result file, then
// exits, so a module that keeps a handle open cannot hold the check. The
// modules own stdout. With conditions given, every import, the package's own
// dependencies' too, resolves under those instead of Node's.
const IMPORT_EACH = `import { writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
const { specifiers, conditions, resultFile } = JSON.parse(process.argv[1]);
if (conditions) {
  registerHooks({
    resolve: (specifier, context, next) => next(specifier, {
      ...context,
      conditions: context.conditions.includes("require")
        ? conditions.map((name) => (name === "import" ? "require" : name))
        : conditions,
    }),
  });
}
const failed = [];
for (const specifier of specifiers) {
  try { await import(specifier); }
  catch (error) { failed.push(specifier + ": " + (error instanceof Error ? error.message : String(error)).split("\\n")[0]); }
}
writeFileSync(resultFile, JSON.stringify(failed));
process.exit(0);
`;

const TIMEOUT_MS = 120_000;
const STDERR_LIMIT = 64 * 1024;

async function importAll(
  consumerRoot: string,
  consumer: Consumer,
  specifiers: readonly string[],
  signal: AbortSignal | undefined,
): Promise<string[]> {
  if (specifiers.length === 0) return [];
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  delete env.NODE_PATH;
  const resultFile = join(dirname(consumerRoot), `${consumer}-result.json`);
  const input = {
    specifiers,
    conditions: consumer === "browser" ? [...CONDITIONS.browser] : null,
    resultFile,
  };
  const ended = await new Promise<string>((done) => {
    const child = spawn(
      process.execPath,
      ["--input-type=module", "-e", IMPORT_EACH, JSON.stringify(input)],
      { cwd: consumerRoot, env, signal, stdio: ["ignore", "ignore", "pipe"] },
    );
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, TIMEOUT_MS);
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      if (stderr.length < STDERR_LIMIT) stderr += chunk;
    });
    child.on("error", (error) => done(error.message));
    child.on("close", (code, killedBy) => {
      clearTimeout(timer);
      if (timedOut) {
        done(`did not finish its imports within ${TIMEOUT_MS / 1000} seconds`);
        return;
      }
      const how = killedBy === null ? `exited with ${code}` : `got ${killedBy}`;
      const why = stderr.trim().split("\n")[0];
      done(why ? `${how}: ${why}` : how);
    });
  });
  if (!existsSync(resultFile)) {
    return [`${consumer} consumer did not finish: it ${ended}`];
  }
  return (JSON.parse(readFileSync(resultFile, "utf8")) as string[]).map(
    (failure) =>
      `${consumer} consumer cannot import ${failure.replace(/ imported from \S*\[eval\d*\]$/, "")}`,
  );
}

export async function checkPackedConsumer(
  projectRoot: string,
  packed: PackedRelease,
  unbuilt: ReadonlySet<string>,
  signal?: AbortSignal,
): Promise<string[]> {
  const { manifest, files } = packed;
  const consumerRoot = join(packed.directory, "consumer");
  const modules = join(consumerRoot, "node_modules");
  const installRoot = join(modules, ...manifest.name.split("/"));
  for (const [path, bytes] of files) {
    const target = resolve(installRoot, path);
    if (!target.startsWith(`${installRoot}${sep}`)) {
      return [`the tarball has an entry outside the package: ${path}`];
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  }
  writeFileSync(
    join(consumerRoot, "package.json"),
    `${JSON.stringify({ name: "ph-packed-consumer", private: true, type: "module" })}\n`,
  );
  const runtime = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.optionalDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
  ]);
  for (const name of runtime) {
    if (name === manifest.name) continue;
    const from = installed(projectRoot, name);
    if (from === undefined) continue;
    const link = join(modules, ...name.split("/"));
    mkdirSync(dirname(link), { recursive: true });
    symlinkSync(from, link, process.platform === "win32" ? "junction" : "dir");
  }
  const { imports, missing } = packedEntries(
    manifest,
    new Set(files.keys()),
    unbuilt,
  );
  const failures = await Promise.all(
    (["node", "browser"] as const).map((consumer) =>
      importAll(consumerRoot, consumer, imports[consumer], signal),
    ),
  );
  return [
    ...missing.map((entry) => `${entry}, which the package does not contain`),
    ...failures.flat(),
  ].map((failure) =>
    failure
      .replaceAll(`${consumerRoot}${sep}`, "")
      .replaceAll(consumerRoot, "."),
  );
}
