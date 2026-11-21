import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PACKAGE_NAME_PATTERN } from "./host-schemas.js";

/**
 * How a host is addressed (decision D5). A bare name (`switchboard`) is the
 * project's own host, `<project>/hosts/switchboard/`, always: a package
 * cannot shadow it. `<package>/<host>` (`@powerhousedao/vetra-cli/studio`,
 * `tools/studio`) is a host an installed package supplies, in the `hosts/`
 * folder it ships: `<package>/hosts/studio/`. The host is the last segment,
 * so a host name has no `/`. Only inside a package's compound does a bare
 * member name look in that package first (`locateHost`'s `scope`).
 */

export class HostLoadError extends Error {
  constructor(message: string, hint?: string) {
    super(hint ? `${message}\n  Hint: ${hint}` : message);
    this.name = "HostLoadError";
  }
}

/** An installed package that supplies hosts: its name and its real folder,
 * which its host files and their module specifiers resolve from. */
export interface HostPackage {
  name: string;
  root: string;
}

export interface HostRef {
  /** Absent: the project's own host. */
  package?: string;
  /** The folder under `hosts/`. */
  host: string;
}

/** Splits a ref at its last `/`; refuses what names no host. */
export function parseHostRef(ref: string): HostRef {
  const slash = ref.lastIndexOf("/");
  if (slash === -1) return { host: ref };
  const pkg = ref.slice(0, slash);
  const host = ref.slice(slash + 1);
  if (/^@[^/]*$/.test(pkg) || (ref.startsWith("@") && host === "")) {
    throw new HostLoadError(
      `"${ref}" names a package, not a host.`,
      `A package's host is <package>/<host>, e.g. \`ph run ${ref.replace(/\/$/, "")}/<host>\`.`,
    );
  }
  if (!PACKAGE_NAME_PATTERN.test(pkg)) {
    throw new HostLoadError(
      `"${ref}" names no host: a host is <host> (the project's) or <package>/<host>, a host name has no "/", and "${pkg}" is no package name.`,
    );
  }
  if (host === "") {
    throw new HostLoadError(
      `"${ref}" names package "${pkg}" but no host.`,
      `Write ${pkg}/<host>.`,
    );
  }
  return { package: pkg, host };
}

export function formatHostRef(ref: HostRef): string {
  return ref.package === undefined ? ref.host : `${ref.package}/${ref.host}`;
}

/** Where messages point for a host file: `hosts/<host>/host.js`, behind its
 * package for a package's (`@acme/tools/hosts/studio/host.js`). */
export function hostFileLabel(
  folder: string,
  hostPackage?: HostPackage,
): string {
  const file = `hosts/${folder}/host.js`;
  return hostPackage ? `${hostPackage.name}/${file}` : file;
}

function packageJsonName(dir: string): string | undefined {
  try {
    const name = (
      JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as {
        name?: unknown;
      }
    ).name;
    return typeof name === "string" ? name : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The installed package `name`, found from the project root as Node finds
 * it: the first `<dir>/node_modules/<name>/package.json` on the project's
 * lookup paths, by its real path (a pnpm link leads to the package's own
 * folder, whose dependencies are its own). Not through `exports`, which may
 * not list `package.json`.
 */
export function findHostPackage(
  projectRoot: string,
  name: string,
  host: string,
): HostPackage {
  const root = path.resolve(projectRoot);
  if (packageJsonName(root) === name) {
    throw new HostLoadError(
      `"${name}/${host}": "${name}" is this project's own package.`,
      `Run the project's own host by its bare name: \`ph run ${host}\`.`,
    );
  }
  const lookup =
    createRequire(
      pathToFileURL(path.join(root, "package.json")).href,
    ).resolve.paths(name) ?? [];
  for (const dir of lookup) {
    const candidate = path.join(dir, name);
    if (existsSync(path.join(candidate, "package.json"))) {
      return { name, root: realpathSync(candidate) };
    }
  }
  throw new HostLoadError(
    `Package "${name}" is not installed in this project, so it supplies no host "${host}".`,
    `Add ${name} as a dependency of the project (looked up from ${root}).`,
  );
}

/** The `<name>/host.js` folders under `<root>/hosts`, sorted; undefined
 * when there is no hosts/ folder. */
export function hostFolders(root: string): string[] | undefined {
  const dir = path.join(root, "hosts");
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return undefined;
  return readdirSync(dir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        existsSync(path.join(dir, entry.name, "host.js")),
    )
    .map((entry) => entry.name)
    .sort();
}

/** Where a host's file is, and who supplies it. */
export interface HostLocation {
  /** How it is addressed from anywhere in the project: bare for the
   * project's own, `<package>/<host>` for a package's. A compound starts an
   * own-process member with it, and its record names the member by it. */
  ref: string;
  /** Its folder under `hostsDir`. */
  folder: string;
  /** The `hosts/` folder it is in. */
  hostsDir: string;
  /** The package that supplies it; absent for the project's own. */
  package?: HostPackage;
}

/** A package's host, or why the package has none by that name. */
function packageHostLocation(pkg: HostPackage, host: string): HostLocation {
  const folders = hostFolders(pkg.root);
  if (folders === undefined || folders.length === 0) {
    throw new HostLoadError(
      `Package "${pkg.name}" supplies no hosts: ${pkg.root} has no hosts/<name>/host.js, so "${pkg.name}/${host}" cannot run.`,
    );
  }
  if (!folders.includes(host)) {
    throw new HostLoadError(
      `Package "${pkg.name}" supplies no host "${host}". Its hosts: ${folders.join(", ")}.`,
    );
  }
  return {
    ref: formatHostRef({ package: pkg.name, host }),
    folder: host,
    hostsDir: path.join(pkg.root, "hosts"),
    package: pkg,
  };
}

/**
 * Where `ref` is. `<package>/<host>` is always the installed package's,
 * found from the project root (also when a package's compound writes it). A
 * bare name is the project's, except in a package's compound (`scope`): there
 * the package's own host of that name comes first. Throws a HostLoadError
 * naming the package and the host. A bare name the project lacks is left to
 * the loader's own message (undefined `package`, project `hostsDir`).
 */
export function locateHost(
  projectRoot: string,
  ref: string,
  scope?: HostPackage,
): HostLocation {
  const parsed = parseHostRef(ref);
  if (parsed.package !== undefined) {
    return packageHostLocation(
      findHostPackage(projectRoot, parsed.package, parsed.host),
      parsed.host,
    );
  }
  const own: HostLocation = {
    ref: parsed.host,
    folder: parsed.host,
    hostsDir: path.join(projectRoot, "hosts"),
  };
  if (!scope) return own;
  const supplied = hostFolders(scope.root) ?? [];
  if (supplied.includes(parsed.host)) {
    return packageHostLocation(scope, parsed.host);
  }
  const projects = hostFolders(projectRoot) ?? [];
  if (projects.includes(parsed.host)) return own;
  throw new HostLoadError(
    `Unknown host "${parsed.host}": package "${scope.name}" supplies none (its hosts: ${supplied.join(", ") || "none"}), and neither does the project (its hosts: ${projects.join(", ") || "none"}).`,
  );
}
