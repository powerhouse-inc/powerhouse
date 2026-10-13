import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Loads and pre-validates a `hosts/<name>/host.js` definition.
 *
 * A host file is a static PROJECTION of powerhouse.config.json: plain ESM,
 * default-exporting a data object. Three gates run before any runner sees it:
 *  1. import lint — the only legal import is the project's
 *     powerhouse.config.json (host files are data, not programs);
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

/** Rejects every import except the project's powerhouse.config.json, plus any
 * dynamic `import(...)` or `require(...)`. Source-level enforcement: the JSON
 * round trip below is the hard gate; this one produces the better error. */
export function lintHostImports(source: string, file: string): void {
  for (const match of source.matchAll(
    /^\s*import\b[^;'"]*?from\s+["']([^"']+)["']/gm,
  )) {
    const specifier = match[1];
    if (!specifier.endsWith(CONFIG_IMPORT_SUFFIX)) {
      throw new HostLoadError(
        `${file} imports "${specifier}" — a host file may only import the project's powerhouse.config.json.`,
        "Host files are static projections; code belongs in plugins.js or the runner.",
      );
    }
  }
  if (/^\s*import\s+["']/m.test(source)) {
    throw new HostLoadError(
      `${file} contains a side-effect import — a host file may only import the project's powerhouse.config.json.`,
    );
  }
  if (/\bimport\s*\(/.test(source) || /\brequire\s*\(/.test(source)) {
    throw new HostLoadError(
      `${file} uses dynamic import()/require() — host files are static data.`,
    );
  }
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

export interface HostDefinition {
  name: string;
  runner: { module: string } & Record<string, unknown>;
  config?: Record<string, unknown>;
  profile?: Record<string, unknown>;
  reactor?: Record<string, unknown>;
  children?: Record<string, unknown>;
}

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
  lintHostImports(readFileSync(file, "utf8"), file);

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
