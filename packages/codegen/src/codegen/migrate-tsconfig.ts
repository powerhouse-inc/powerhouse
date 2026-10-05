import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join, posix } from "path";
import { ts } from "ts-morph";

type CompilerOptions = Record<string, unknown>;

// Options TypeScript 7 rejects outright.
const REMOVED_OPTIONS = [
  "charset",
  "downlevelIteration",
  "importsNotUsedAsValues",
  "keyofStringsOnly",
  "noImplicitUseStrict",
  "noStrictGenericChecks",
  "out",
  "outFile",
  "preserveValueImports",
  "suppressExcessPropertyErrors",
  "suppressImplicitAnyIndexErrors",
];

// Options TypeScript 7 only accepts as true, which is now the default.
const REMOVED_FALSE_OPTIONS = [
  "allowSyntheticDefaultImports",
  "alwaysStrict",
  "esModuleInterop",
];

const REMOVED_MODULE_RESOLUTION = ["classic", "node", "node10"];
const REMOVED_MODULES = ["amd", "none", "system", "umd"];
const REMOVED_TARGETS = ["es3", "es5"];
const NODE_MODULES = ["node16", "node18", "node20", "nodenext"];

function lower(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function rebasePath(baseUrl: string, target: string): string {
  const joined = posix.join(baseUrl, target);
  return joined.startsWith(".") ? joined : `./${joined}`;
}

// Rewrites the options TypeScript 7 removed; returns whether anything changed.
// `baseUrl` becomes explicit `paths`, plus a `*` entry for bare specifiers.
export function migrateCompilerOptions(options: CompilerOptions): boolean {
  let changed = false;
  const drop = (key: string): void => {
    delete options[key];
    changed = true;
  };

  for (const key of REMOVED_OPTIONS) if (key in options) drop(key);
  for (const key of REMOVED_FALSE_OPTIONS) {
    if (options[key] === false) drop(key);
  }

  if (typeof options.baseUrl === "string") {
    const baseUrl = options.baseUrl;
    const paths = (options.paths ?? {}) as Record<string, string[]>;
    const rebased: Record<string, string[]> = {};
    for (const [pattern, targets] of Object.entries(paths)) {
      rebased[pattern] = targets.map((t) => rebasePath(baseUrl, t));
    }
    rebased["*"] ??= [rebasePath(baseUrl, "*")];
    options.paths = rebased;
    drop("baseUrl");
  }

  if (REMOVED_MODULES.includes(lower(options.module))) {
    options.module = "esnext";
    changed = true;
  }
  if (REMOVED_TARGETS.includes(lower(options.target))) {
    options.target = "es2015";
    changed = true;
  }
  if (REMOVED_MODULE_RESOLUTION.includes(lower(options.moduleResolution))) {
    if (NODE_MODULES.includes(lower(options.module))) {
      drop("moduleResolution");
    } else {
      options.moduleResolution = "bundler";
      changed = true;
    }
  }
  return changed;
}

// Fixes removed options in every root `tsconfig*.json` of a project and returns
// the files it rewrote. A rewritten file loses its comments.
export function migrateTsconfigFiles(projectDir: string): string[] {
  const changed: string[] = [];
  const files = readdirSync(projectDir)
    .filter((name) => /^tsconfig(\..+)?\.json$/.test(name))
    .sort();
  for (const name of files) {
    const file = join(projectDir, name);
    const parsed = ts.parseConfigFileTextToJson(
      file,
      readFileSync(file, "utf8"),
    );
    const config: unknown = parsed.config;
    if (parsed.error || typeof config !== "object" || config === null) continue;
    const options = (config as { compilerOptions?: CompilerOptions })
      .compilerOptions;
    if (!options || !migrateCompilerOptions(options)) continue;
    writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
    changed.push(name);
  }
  return changed;
}
