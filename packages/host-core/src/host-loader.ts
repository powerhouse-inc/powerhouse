import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import type { HostDefinition } from "./host-schemas.js";
import type { PluginEntryData } from "./plugins.js";
import { resolvePluginContributions } from "./plugins-resolve.js";
import { resolveRunnerModule } from "./runner-resolver.js";

/**
 * Loads and pre-validates a `hosts/<name>/host.js` definition.
 *
 * A host file is a static PROJECTION of powerhouse.config.json: plain ESM,
 * default-exporting a data object. Three gates run before any runner sees it:
 *  1. import lint — the only legal imports are the project's
 *     powerhouse.config.json, sibling `../<host>/host.js` files and sibling
 *     generated `../<host>/outputs.js` token trees (host files are data, not
 *     programs; `process.` is banned, environment values go through `$env`).
 *     An imported outputs.js whose schema hash no longer matches its
 *     producer fails here ("run `ph generate hosts`");
 *  2. static check — the exported object must survive a JSON round trip
 *     (functions, undefined, class instances, Dates etc. are rejected,
 *     reporting the offending path);
 *  3. shape pre-check — `name`, `runner.module`, and the reactor XOR children
 *     rule. Full validation is the runner's `hostSchema` (phase 2).
 *
 * This module never exits the process — callers own error presentation.
 */

const HOST_FILE = "host.js";
const CONFIG_IMPORT_SUFFIX = "powerhouse.config.json";

export class HostLoadError extends Error {
  constructor(message: string, hint?: string) {
    super(hint ? `${message}\n  Hint: ${hint}` : message);
    this.name = "HostLoadError";
  }
}

export type HostsFolderStatus =
  | { kind: "absent" }
  | { kind: "empty"; dir: string }
  | { kind: "present"; dir: string; hosts: string[] };

/** A `hosts/` folder with no `<name>/host.js` inside is "empty" — the guard
 * state: callers warn loudly and fall back to legacy rather than activating
 * the new architecture off a stray `mkdir hosts`. */
export function probeHostsFolder(projectRoot: string): HostsFolderStatus {
  const dir = path.join(projectRoot, "hosts");
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    return { kind: "absent" };
  }
  const hosts = readdirSync(dir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        existsSync(path.join(dir, entry.name, HOST_FILE)),
    )
    .map((entry) => entry.name)
    .sort();
  return hosts.length === 0
    ? { kind: "empty", dir }
    : { kind: "present", dir, hosts };
}

/** Sibling imports: `../<host>/host.js` — source material for derived
 * compositions (full-inclusion wrappers compute over them with plain JS) —
 * and `../<host>/outputs.js`, the generated `$output` token tree. */
const SIBLING_IMPORT = /^\.\.\/([A-Za-z0-9_-]+)\/(host\.js|outputs\.js)$/;

/** The generated per-host token tree (`ph generate hosts`). */
export const OUTPUTS_FILE = "outputs.js";
const GENERATE_HINT =
  "Run `ph generate hosts` to (re)generate hosts/<name>/outputs.js from the producer's runner outputsSchema and declared drives.";

/**
 * One pass over JS source that blanks every comment and, with
 * `literals: "blank"`, the CONTENTS of string literals and template-literal
 * text (quotes, backticks and `${`/`}` kept). A template's `${…}` holes are
 * code: they are scanned like the rest (strings, nested templates and braces
 * inside them included). Every newline survives, so line-anchored checks and
 * line numbers still match the original source. Regex literals are not
 * recognised (host files are data; a regex is not one).
 */
function scanSource(source: string, literals: "keep" | "blank"): string {
  const blank = (text: string) => text.replace(/[^\n]/g, " ");
  const literal = (text: string) => (literals === "blank" ? blank(text) : text);
  let out = "";
  let i = 0;
  // One entry per open `${` hole: the depth of `{` opened inside it.
  const holes: number[] = [];
  /** Template text from `i` (just after a backtick or a hole's `}`) up to
   * and including its closing backtick, or up to and including the next
   * `${` (pushing a hole). */
  const templateText = (): void => {
    let j = i;
    while (j < source.length) {
      const ch = source[j];
      if (ch === "\\") {
        j += 2;
        continue;
      }
      if (ch === "`") break;
      if (ch === "$" && source[j + 1] === "{") break;
      j++;
    }
    out += literal(source.slice(i, Math.min(j, source.length)));
    if (j >= source.length) {
      i = source.length;
    } else if (source[j] === "`") {
      out += "`";
      i = j + 1;
    } else {
      out += "${";
      holes.push(0);
      i = j + 2;
    }
  };
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === "/" && next === "/") {
      const end = source.indexOf("\n", i);
      const stop = end === -1 ? source.length : end;
      out += blank(source.slice(i, stop));
      i = stop;
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += blank(source.slice(i, stop));
      i = stop;
      continue;
    }
    if (ch === '"' || ch === "'") {
      // Up to the closing quote; an unterminated one stops at the newline.
      let j = i + 1;
      while (j < source.length && source[j] !== ch && source[j] !== "\n") {
        j += source[j] === "\\" ? 2 : 1;
      }
      const close = source[j] === ch ? ch : "";
      out += ch + literal(source.slice(i + 1, Math.min(j, source.length)));
      out += close;
      i = close ? j + 1 : j;
      continue;
    }
    if (ch === "`") {
      out += "`";
      i++;
      templateText();
      continue;
    }
    if (holes.length > 0 && ch === "{") holes[holes.length - 1]++;
    if (holes.length > 0 && ch === "}") {
      if (holes[holes.length - 1] === 0) {
        holes.pop();
        out += "}";
        i++;
        templateText();
        continue;
      }
      holes[holes.length - 1]--;
    }
    out += ch;
    i++;
  }
  return out;
}

/** Blank out `//` and block comments, keeping string and template literals
 * (URLs contain `//`) and every newline, so line-anchored checks still see
 * the code's own lines. A JSDoc `import("…")` type is a comment, not code. */
export function stripComments(source: string): string {
  return scanSource(source, "keep");
}

/** Blank out comments and the contents of string literals and
 * template-literal text, so a word inside a string (a URL, a description,
 * an apostrophe in template text) is neither mistaken for code nor able to
 * hide code. Template `${…}` holes are code and are kept. */
function blankLiterals(source: string): string {
  return scanSource(source, "blank");
}

// Not after `.`/identifier chars: `base.runner.process.args` is a property.
const PROCESS_ACCESS = /(?<![.\w$])process\s*(?:\?\.|\.|\[)/;

/** Host files and generated outputs.js are data: reading the environment
 * through `process.` is banned (typed-host-configs decision 9). Environment
 * values go through `$env`, which resolves at start in the resolving
 * process. Comments are already stripped, so a mention there is fine. */
function rejectProcessAccess(source: string, file: string): void {
  const match = PROCESS_ACCESS.exec(blankLiterals(source));
  if (!match) return;
  const line = source.slice(0, match.index).split("\n").length;
  throw new HostLoadError(
    `${file}:${line} reads \`process.\` — host files cannot read the environment directly.`,
    'Use an $env token instead: { $env: "NAME" } (fails when unset), or { $env: { name: "NAME", optional: true } } as a property value to omit the property when unset. It resolves when the host starts.',
  );
}

/** The imports a host file makes, after linting it. */
export interface HostImports {
  /** Sibling hosts whose `host.js` the file imports. */
  hosts: string[];
  /** Sibling hosts whose generated `outputs.js` the file imports. */
  outputs: string[];
}

/** Lints a host file and returns what it imports. Rejects every import
 * except the project's powerhouse.config.json, SIBLING host files (R1:
 * derived compositions) and sibling generated outputs.js token trees; any
 * dynamic `import(...)` or `require(...)`; and any `process.` access.
 * Source-level enforcement: the JSON round trip below is the hard gate; this
 * one produces the better error. */
export function scanHostImports(rawSource: string, file: string): HostImports {
  const source = stripComments(rawSource);
  const imports: HostImports = { hosts: [], outputs: [] };
  for (const match of source.matchAll(
    /^\s*import\b[^;'"]*?from\s+["']([^"']+)["']/gm,
  )) {
    const specifier = match[1];
    if (specifier.endsWith(CONFIG_IMPORT_SUFFIX)) continue;
    const sibling = SIBLING_IMPORT.exec(specifier);
    if (sibling) {
      (sibling[2] === HOST_FILE ? imports.hosts : imports.outputs).push(
        sibling[1],
      );
      continue;
    }
    throw new HostLoadError(
      `${file} imports "${specifier}" — a host file may only import the project's powerhouse.config.json, sibling hosts/<name>/host.js files or generated hosts/<name>/${OUTPUTS_FILE} token trees.`,
      "Host files are static projections; code belongs in plugins or the runner.",
    );
  }
  if (/^\s*import\s+["']/m.test(source)) {
    throw new HostLoadError(
      `${file} contains a side-effect import — a host file may only import the project's powerhouse.config.json or sibling host files.`,
    );
  }
  if (/\bimport\s*\(/.test(source) || /\brequire\s*\(/.test(source)) {
    throw new HostLoadError(
      `${file} uses dynamic import()/require() — host files are static data.`,
    );
  }
  rejectProcessAccess(source, file);
  return imports;
}

/** {@link scanHostImports}, returning only the sibling host names (for cycle
 * detection). */
export function lintHostImports(rawSource: string, file: string): string[] {
  return scanHostImports(rawSource, file).hosts;
}

/** A generated `outputs.js` is plain data: no imports of any kind, no
 * dynamic import/require, no `process.`. */
export function lintOutputsFile(rawSource: string, file: string): void {
  const source = stripComments(rawSource);
  if (
    /^\s*import\b/m.test(source) ||
    /^\s*export\b[^;]*?\bfrom\s+["']/m.test(source) ||
    /\bimport\s*\(/.test(source) ||
    /\brequire\s*\(/.test(source)
  ) {
    throw new HostLoadError(
      `${file} imports a module — a generated ${OUTPUTS_FILE} is plain data.`,
      "Regenerate it with `ph generate hosts` instead of editing it.",
    );
  }
  rejectProcessAccess(source, file);
}

/** Walks the sibling-import graph from `hostName`, linting every visited file
 * (and every outputs.js it imports) and failing on a cycle (an ESM circular
 * would otherwise surface as an undefined default export with no useful
 * message). Returns the hosts whose outputs.js the graph imports, sorted. */
export function lintHostImportGraph(
  hostsDir: string,
  hostName: string,
): string[] {
  const state = new Map<string, "visiting" | "done">();
  const producers = new Set<string>();
  const visit = (name: string, chain: string[]): void => {
    const mark = state.get(name);
    if (mark === "done") return;
    if (mark === "visiting") {
      throw new HostLoadError(
        `Host import cycle: ${[...chain, name].map((n) => `hosts/${n}`).join(" -> ")}.`,
        "Hoist the shared data into one host (or powerhouse.config.json) instead of importing both ways.",
      );
    }
    const file = path.join(hostsDir, name, HOST_FILE);
    if (!existsSync(file)) {
      throw new HostLoadError(
        `hosts/${chain[chain.length - 1] ?? name} imports sibling "hosts/${name}/host.js", which does not exist.`,
      );
    }
    state.set(name, "visiting");
    const imports = scanHostImports(readFileSync(file, "utf8"), file);
    for (const producer of imports.outputs) {
      if (producers.has(producer)) continue;
      const outputsFile = path.join(hostsDir, producer, OUTPUTS_FILE);
      if (!existsSync(outputsFile)) {
        throw new HostLoadError(
          `hosts/${name}/host.js imports "hosts/${producer}/${OUTPUTS_FILE}", which does not exist.`,
          GENERATE_HINT,
        );
      }
      lintOutputsFile(readFileSync(outputsFile, "utf8"), outputsFile);
      producers.add(producer);
    }
    for (const sibling of imports.hosts) visit(sibling, [...chain, name]);
    state.set(name, "done");
  };
  visit(hostName, []);
  return [...producers].sort();
}

/** Returns the path of the first value that would not survive a JSON round
 * trip, or undefined when the object is fully static. */
export function findNonStaticValue(
  value: unknown,
  trail = "",
): string | undefined {
  if (value === null) return undefined;
  const kind = typeof value;
  if (kind === "string" || kind === "number" || kind === "boolean") {
    return undefined;
  }
  if (kind !== "object") {
    return `${trail || "<root>"} (${kind})`;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findNonStaticValue(value[i], `${trail}[${i}]`);
      if (hit) return hit;
    }
    return undefined;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    return `${trail || "<root>"} (non-plain object)`;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const hit = findNonStaticValue(child, trail ? `${trail}.${key}` : key);
    if (hit) return hit;
  }
  return undefined;
}

export type { HostDefinition } from "./host-schemas.js";

export interface LoadedHost {
  name: string;
  dir: string;
  file: string;
  host: HostDefinition;
}

function assertHostShape(
  host: Record<string, unknown>,
  file: string,
): asserts host is HostDefinition & Record<string, unknown> {
  if (typeof host.name !== "string" || host.name.length === 0) {
    throw new HostLoadError(`${file}: \`name\` must be a non-empty string.`);
  }
  const runner = host.runner;
  if (
    runner === null ||
    typeof runner !== "object" ||
    typeof (runner as Record<string, unknown>).module !== "string"
  ) {
    throw new HostLoadError(
      `${file}: \`runner\` must be an object with a \`module\` specifier string.`,
    );
  }
  if (host.reactor !== undefined && host.children !== undefined) {
    throw new HostLoadError(
      `${file}: \`reactor\` and \`children\` are mutually exclusive — a host is a reactor runner or a compound runner, never both.`,
    );
  }
}

export async function loadHost(
  projectRoot: string,
  hostName: string,
): Promise<LoadedHost> {
  return importHost(projectRoot, hostName, true);
}

async function importHost(
  projectRoot: string,
  hostName: string,
  checkOutputs: boolean,
): Promise<LoadedHost> {
  const probe = probeHostsFolder(projectRoot);
  if (probe.kind === "absent") {
    throw new HostLoadError(
      `No hosts/ folder found in ${projectRoot}.`,
      "Scaffold one with `ph init --uniform-runners` (or create hosts/<name>/host.js).",
    );
  }
  if (probe.kind === "empty") {
    throw new HostLoadError(
      `hosts/ exists at ${probe.dir} but contains no <name>/host.js.`,
      "An empty hosts/ folder does not activate the uniform-runners architecture; add a host definition or remove the folder.",
    );
  }
  if (!probe.hosts.includes(hostName)) {
    throw new HostLoadError(
      `Unknown host "${hostName}". Available hosts: ${probe.hosts.join(", ")}.`,
    );
  }

  const file = path.join(probe.dir, hostName, HOST_FILE);
  const producers = lintHostImportGraph(probe.dir, hostName);
  // Step 1 of the loader pipeline: a stale outputs.js fails before the host
  // is evaluated (its token tree may name outputs that no longer exist).
  if (checkOutputs) {
    for (const producer of producers) {
      await assertOutputsFileFresh(projectRoot, probe.dir, hostName, producer);
    }
  }

  const module = (await import(pathToFileURL(file).href)) as {
    default?: unknown;
  };
  const host = module.default;
  if (host === null || typeof host !== "object" || Array.isArray(host)) {
    throw new HostLoadError(
      `${file} must default-export the host object (\`export default { name, runner, ... }\`).`,
    );
  }

  const nonStatic = findNonStaticValue(host);
  if (nonStatic) {
    throw new HostLoadError(
      `${file} exports a non-static value at \`${nonStatic}\` — host files must survive a JSON round trip.`,
      "Runtime behavior belongs in the runner; host files only carry data.",
    );
  }

  assertHostShape(host as Record<string, unknown>, file);
  return {
    name: hostName,
    dir: path.dirname(file),
    file,
    host: host as HostDefinition,
  };
}

/* ---------------------------------------------------- generated outputs.js */

/** What `ph generate hosts` derives a host's outputs.js from, plus the hash
 * of exactly those inputs (embedded in the file; the loader recomputes it). */
export interface HostOutputsDescription {
  /** The producer's folder name: the `host` of every `$output` token. */
  host: string;
  runnerModule: string;
  /** JSON Schema of the runner's `outputsSchema` (output side, no `$schema`). */
  outputsSchema: Record<string, unknown>;
  /** Declared LOCAL drive slugs: `reactor.drives` without remote drives,
   * plus drives the host's plugins contribute (any verb). Sorted, unique.
   * These are the known keys of the `drives` record output. */
  drives: string[];
  hash: string;
}

const OUTPUTS_HASH_EXPORT = /^export const outputsHash = "([^"]+)";$/m;

/** The hash a generated outputs.js carries, or undefined. */
export function readOutputsFileHash(source: string): string | undefined {
  return OUTPUTS_HASH_EXPORT.exec(source)?.[1];
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** sha256 over the canonical JSON of the generator's inputs. The host name
 * is one: every token in the file carries it, so a copied or renamed host
 * folder makes its outputs.js stale. */
export function computeOutputsHash(input: {
  host: string;
  runnerModule: string;
  outputsSchema: Record<string, unknown>;
  drives: readonly string[];
}): string {
  const digest = createHash("sha256")
    .update(
      canonicalJson({
        v: 1,
        host: input.host,
        runnerModule: input.runnerModule,
        outputsSchema: input.outputsSchema,
        drives: [...new Set(input.drives)].sort(),
      }),
    )
    .digest("hex");
  return `sha256:${digest.slice(0, 32)}`;
}

function isZodSchema(value: unknown): value is z.ZodType {
  return value !== null && typeof value === "object" && "_zod" in value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Local (non-remote) slugs from a drive declaration list. */
function localDriveSlugs(drives: unknown): string[] {
  if (!Array.isArray(drives)) return [];
  return drives.flatMap((drive) =>
    isRecord(drive) &&
    typeof drive.slug === "string" &&
    drive.remote === undefined
      ? [drive.slug]
      : [],
  );
}

/**
 * Describes the outputs a host's creation produces, for `ph generate hosts`
 * and the loader's staleness check: the runner's `outputsSchema` as JSON
 * Schema and the host's declared local drives (the keys `drives.<slug>` of a
 * switchboard-like runner). Returns undefined when the runner exports no
 * `outputsSchema` (the host produces nothing a token can reference).
 *
 * Plugin-contributed drives are collected across every verb (verb scoping
 * is ignored: a drive any verb serves is referenceable). Plugins the project
 * tree cannot resolve contribute nothing, exactly as at boot. The implicit
 * default drive a switchboard serves when it declares none is NOT a known
 * key (it is not declared); reach it with a literal `$output` token.
 */
export async function describeHostOutputs(
  projectRoot: string,
  hostName: string,
): Promise<HostOutputsDescription | undefined> {
  const { host, file } = await importHost(projectRoot, hostName, false);
  const runnerModule = host.runner.module;
  const runner = await resolveRunnerModule(projectRoot, runnerModule);
  const schema = runner.outputsSchema;
  if (!isZodSchema(schema)) return undefined;
  const { $schema: _dialect, ...outputsSchema } = z.toJSONSchema(schema, {
    io: "output",
    unrepresentable: "any",
  }) as Record<string, unknown>;

  const reactor = (host as { reactor?: unknown }).reactor;
  const drives = localDriveSlugs(isRecord(reactor) ? reactor.drives : []);
  const entries: PluginEntryData[] = (host.runner.plugins ?? []).map((entry) =>
    typeof entry === "string" ? entry : { ...entry, verbs: "*" },
  );
  if (entries.length > 0) {
    const plan = await resolvePluginContributions(
      projectRoot,
      "*",
      entries,
      path.relative(projectRoot, file),
    );
    drives.push(
      ...localDriveSlugs(plan.drives.map((drive) => drive.declaration)),
    );
  }
  const sortedDrives = [...new Set(drives)].sort();
  return {
    host: hostName,
    runnerModule,
    outputsSchema,
    drives: sortedDrives,
    hash: computeOutputsHash({
      host: hostName,
      runnerModule,
      outputsSchema,
      drives: sortedDrives,
    }),
  };
}

async function assertOutputsFileFresh(
  projectRoot: string,
  hostsDir: string,
  consumer: string,
  producer: string,
): Promise<void> {
  const rel = `hosts/${producer}/${OUTPUTS_FILE}`;
  const actual = readOutputsFileHash(
    readFileSync(path.join(hostsDir, producer, OUTPUTS_FILE), "utf8"),
  );
  if (!existsSync(path.join(hostsDir, producer, HOST_FILE))) {
    throw new HostLoadError(
      `hosts/${consumer} imports ${rel}, but there is no hosts/${producer}/host.js to produce it.`,
      "Delete the orphaned outputs.js and fix the import.",
    );
  }
  const description = await describeHostOutputs(projectRoot, producer);
  if (!description) {
    throw new HostLoadError(
      `hosts/${consumer} imports ${rel}, but hosts/${producer}'s runner declares no outputsSchema, so it produces no outputs.`,
    );
  }
  if (actual !== description.hash) {
    throw new HostLoadError(
      `${rel} is stale (its producer's outputsSchema or declared drives changed since it was generated); run \`ph generate hosts\`.`,
      actual === undefined
        ? `${rel} carries no outputsHash export; it was not generated by \`ph generate hosts\`.`
        : `expected ${description.hash}, found ${actual}.`,
    );
  }
}
