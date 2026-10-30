import type { HostExport } from "@powerhousedao/host-core/schema";
import fs from "node:fs";
import path from "node:path";
import { isRecord, membersOf } from "../host-rules/members.ts";
import {
  COPY_CONNECT_PORT_OFFSET,
  copyPortClashes,
  copyPortOf,
  copyPortOverflow,
} from "../host-rules/ports.ts";
import { hostFiles } from "../lib/host-files.ts";

/** A host folder: one safe path segment. */
export const FOLDER_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;

/** Never copied: installed or built output, local state and secrets. */
const SKIPPED_ENTRIES = new Set(["node_modules", "dist", "coverage"]);
const MAX_COPIED_FILES = 20_000;
const MAX_COPIED_BYTES = 512 * 1024 * 1024;

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

export { COPY_CONNECT_PORT_OFFSET };

export type CopyConnectPort = { member: string; port: number };

/** Each Connect member's fixed port in a copy; refuses ports two members would share. */
export function copyConnectPorts(envelope: HostExport): CopyConnectPort[] {
  const members = membersOf({ envelope });
  for (const member of members) {
    const overflow = copyPortOverflow(member);
    if (overflow) throw new MaterializeError(overflow);
  }
  const [clash] = copyPortClashes(members);
  if (clash) throw new MaterializeError(clash.message);
  return members.flatMap((member) => {
    const port = copyPortOf(member);
    return member.role === "connect" && port !== undefined
      ? [{ member: member.key, port }]
      : [];
  });
}

/** Free switchboard ports; Connect's copy port keeps its own browser storage. */
export function withFreePorts(envelope: HostExport): HostExport {
  const copy = structuredClone(envelope);
  const host = copy.host as unknown as Record<string, unknown>;
  const members = copy.members as Record<string, unknown>;
  const children = isRecord(host.children) ? host.children : {};
  const connectPorts = new Map(
    copyConnectPorts(envelope).map(({ member, port }) => [member, port]),
  );
  const setPort = (definition: unknown, runner: Record<string, unknown>) => {
    if (!isRecord(definition)) return;
    definition.runner = {
      ...(isRecord(definition.runner) ? definition.runner : {}),
      ...runner,
    };
  };
  for (const member of membersOf({ envelope: copy })) {
    const port = connectPorts.get(member.key);
    const runner =
      member.role === "switchboard"
        ? { port: 0 }
        : port === undefined
          ? undefined
          : { port, strictPort: true };
    if (!runner) continue;
    if (member.path === "host") {
      setPort(host, runner);
      continue;
    }
    setPort(
      Object.hasOwn(members, member.folder)
        ? members[member.folder]
        : undefined,
      runner,
    );
    setPort(
      Object.hasOwn(children, member.key) ? children[member.key] : undefined,
      runner,
    );
  }
  return copy;
}

/**
 * Each switchboard loads the source project's own package by its absolute
 * root (the copy has no build output), ahead of nothing it already listed.
 * `disableLocal` stops it loading the copy as well.
 */
export function withSourcePackages(
  envelope: HostExport,
  sourceRoot: string,
  extra: readonly string[] = [],
): HostExport {
  if (!path.isAbsolute(sourceRoot)) {
    throw new MaterializeError(`${sourceRoot} is not an absolute path.`);
  }
  const copy = structuredClone(envelope);
  for (const member of membersOf({ envelope: copy })) {
    if (member.role !== "switchboard") continue;
    const config = ensureRecordAt(copy, member.configAt.split("."));
    const switchboard = ensureRecord(config, "switchboard");
    const packages = ensureRecord(switchboard, "packages");
    if (packages.disableLocal === true) continue;
    const listed = Array.isArray(packages.list)
      ? packages.list.filter((p): p is string => typeof p === "string")
      : [];
    packages.list = [...new Set([...listed, ...extra, sourceRoot])];
    packages.disableLocal = true;
  }
  return copy;
}

function ensureRecord(
  parent: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const current = parent[key];
  if (isRecord(current)) return current;
  const created: Record<string, unknown> = {};
  parent[key] = created;
  return created;
}

function ensureRecordAt(
  root: unknown,
  segments: readonly string[],
): Record<string, unknown> {
  let at = root as Record<string, unknown>;
  for (const segment of segments) at = ensureRecord(at, segment);
  return at;
}

/** `hosts/<folder>/host.js` for the host and every member: plain data. */
export function renderHostFiles(envelope: HostExport): Map<string, string> {
  const files = new Map<string, string>();
  for (const { folder, content } of hostFiles(envelope)) {
    assertFolder(folder);
    files.set(folder, content);
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

function skipped(at: readonly string[]): boolean {
  const name = at[at.length - 1];
  if (name.startsWith(".") || SKIPPED_ENTRIES.has(name)) return true;
  // The draft's host files replace the project's.
  return at.length === 3 && at[0] === "hosts" && name === "host.js";
}

/** The project's own files, copied: Connect serves them from the copy, and
 * nothing it or vite writes can reach the source. Links are not followed. */
function copyProject(source: string, target: string): void {
  let files = 0;
  let bytes = 0;
  const visit = (from: string, to: string, relative: string[]) => {
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
      const at = [...relative, entry.name];
      if (skipped(at)) continue;
      const src = path.join(from, entry.name);
      const dest = containedPath(to, entry.name);
      if (entry.isDirectory()) {
        fs.mkdirSync(dest);
        visit(src, dest, at);
      } else if (entry.isFile()) {
        files += 1;
        bytes += fs.statSync(src).size;
        if (files > MAX_COPIED_FILES || bytes > MAX_COPIED_BYTES) {
          throw new MaterializeError(
            `${source} is too big to copy for a draft (over ${MAX_COPIED_FILES} files or ${MAX_COPIED_BYTES / 1024 / 1024} MB outside node_modules and dist).`,
          );
        }
        fs.copyFileSync(src, dest, fs.constants.COPYFILE_EXCL);
      }
    }
  };
  visit(source, target, []);
}

export interface Materialized {
  projectDir: string;
  dataDir: string;
}

export interface MaterializeOptions {
  /** Packages every switchboard loads ahead of the source root. */
  packages?: readonly string[];
}

/** A throwaway copy of the project under `instanceDir`, which must not exist. */
export function materialize(
  instanceDir: string,
  sourceRoot: string,
  envelope: HostExport,
  options: MaterializeOptions = {},
): Materialized {
  const files = renderHostFiles(
    withSourcePackages(withFreePorts(envelope), sourceRoot, options.packages),
  );
  fs.mkdirSync(instanceDir);
  const projectDir = containedPath(instanceDir, "project");
  const dataDir = containedPath(instanceDir, "data");
  fs.mkdirSync(projectDir);
  fs.mkdirSync(dataDir);
  copyProject(sourceRoot, projectDir);
  const hostsDir = containedPath(projectDir, "hosts");
  fs.mkdirSync(hostsDir, { recursive: true });
  for (const [folder, source] of files) {
    const dir = containedPath(hostsDir, folder);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(containedPath(dir, "host.js"), source, { flag: "wx" });
  }
  linkPackages(
    path.join(sourceRoot, "node_modules"),
    containedPath(projectDir, "node_modules"),
  );
  return { projectDir, dataDir };
}
