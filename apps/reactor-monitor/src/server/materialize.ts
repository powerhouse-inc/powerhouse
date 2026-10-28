import type { HostExport } from "@powerhousedao/host-core/schema";
import fs from "node:fs";
import path from "node:path";
import { isRecord, membersOf } from "../host-rules/members.ts";

/** A host folder: one safe path segment. */
export const FOLDER_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;

const COPIED_FILES = ["package.json", "powerhouse.config.json"];

export class MaterializeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MaterializeError";
  }
}

/** `target` strictly inside `dir`, else throws. */
export function containedPath(dir: string, ...segments: string[]): string {
  const target = path.resolve(dir, ...segments);
  const relative = path.relative(dir, target);
  if (
    relative === "" ||
    path.isAbsolute(relative) ||
    relative.split(path.sep)[0] === ".."
  ) {
    throw new MaterializeError(`${segments.join("/")} leaves ${dir}.`);
  }
  return target;
}

function assertFolder(name: string): void {
  if (!FOLDER_PATTERN.test(name)) {
    throw new MaterializeError(`"${name}" can't name a host folder.`);
  }
}

/** Every switchboard listens on a free port, so copies never collide. */
export function withFreePorts(envelope: HostExport): HostExport {
  const copy = structuredClone(envelope);
  const host = copy.host as unknown as Record<string, unknown>;
  const members = (copy.members ?? {}) as Record<string, unknown>;
  const children = isRecord(host.children) ? host.children : {};
  const setPort = (definition: unknown) => {
    if (!isRecord(definition)) return;
    definition.runner = {
      ...(isRecord(definition.runner) ? definition.runner : {}),
      port: 0,
    };
  };
  for (const member of membersOf({ envelope: copy })) {
    if (member.role !== "switchboard") continue;
    if (member.path === "host") {
      setPort(host);
      continue;
    }
    setPort(
      Object.hasOwn(members, member.folder)
        ? members[member.folder]
        : undefined,
    );
    setPort(
      Object.hasOwn(children, member.key) ? children[member.key] : undefined,
    );
  }
  return copy;
}

/** `hosts/<folder>/host.js` for the host and every member: plain data. */
export function renderHostFiles(envelope: HostExport): Map<string, string> {
  const files = new Map<string, string>();
  const definitions: [string, unknown][] = [
    [envelope.name, envelope.host],
    ...Object.entries(envelope.members),
  ];
  for (const [folder, definition] of definitions) {
    assertFolder(folder);
    files.set(
      folder,
      `export default ${JSON.stringify(definition, null, 2)};\n`,
    );
  }
  return files;
}

function linkType(target: string): "dir" | "file" | "junction" {
  const directory = fs.statSync(target).isDirectory();
  if (!directory) return "file";
  return process.platform === "win32" ? "junction" : "dir";
}

/** One link per package, to its real path; the folders stay real. */
function linkPackages(source: string, target: string): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(source, { withFileTypes: true });
  } catch {
    return;
  }
  fs.mkdirSync(target);
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const from = path.join(source, entry.name);
    const to = containedPath(target, entry.name);
    if (entry.name.startsWith("@")) {
      linkPackages(from, to);
      continue;
    }
    let real: string;
    try {
      real = fs.realpathSync(from);
      fs.symlinkSync(real, to, linkType(real));
    } catch {
      // a broken link: the source project can't load it either
    }
  }
}

export interface Materialized {
  projectDir: string;
  dataDir: string;
}

/** A throwaway copy of the project under `instanceDir`, which must not exist. */
export function materialize(
  instanceDir: string,
  sourceRoot: string,
  envelope: HostExport,
): Materialized {
  const files = renderHostFiles(withFreePorts(envelope));
  fs.mkdirSync(instanceDir);
  const projectDir = containedPath(instanceDir, "project");
  const dataDir = containedPath(instanceDir, "data");
  fs.mkdirSync(projectDir);
  fs.mkdirSync(dataDir);
  const hostsDir = containedPath(projectDir, "hosts");
  fs.mkdirSync(hostsDir);
  for (const [folder, source] of files) {
    const dir = containedPath(hostsDir, folder);
    fs.mkdirSync(dir);
    fs.writeFileSync(containedPath(dir, "host.js"), source, { flag: "wx" });
  }
  for (const name of COPIED_FILES) {
    const from = path.join(sourceRoot, name);
    if (!fs.existsSync(from)) continue;
    fs.copyFileSync(
      from,
      containedPath(projectDir, name),
      fs.constants.COPYFILE_EXCL,
    );
  }
  linkPackages(
    path.join(sourceRoot, "node_modules"),
    containedPath(projectDir, "node_modules"),
  );
  return { projectDir, dataDir };
}
