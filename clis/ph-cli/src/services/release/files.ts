import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  type Dirent,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import {
  type ApprovalRead,
  parseReleaseApproval,
  RELEASE_APPROVAL_PATH,
  type ReleaseApproval,
} from "./approval.js";
import { packedDigests, packRelease } from "./pack.js";
import { byPath, type FileDigest } from "./revision.js";

const ALWAYS_EXCLUDED = new Set(["node_modules", ".git", ".ph"]);
// A build's stage and retired tree, beside its output while it runs.
const BUILD_SCRATCH = /^\..+\.ph-(stage|old)-/;

const toPosix = (path: string) => path.split(sep).join("/");

/** `path` relative to the package root, in POSIX form. */
export function packagePath(packageRoot: string, path: string): string {
  return toPosix(relative(packageRoot, resolve(packageRoot, path)));
}

function sha256(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** A file's digest; a symlink's is its target text, which is not followed. */
function digestOf(packageRoot: string, path: string): FileDigest | undefined {
  const absolute = join(packageRoot, ...path.split("/"));
  const stat = lstatSync(absolute, { throwIfNoEntry: false });
  if (stat?.isSymbolicLink()) {
    return { path, sha256: sha256(toPosix(readlinkSync(absolute))) };
  }
  return stat?.isFile()
    ? { path, sha256: sha256(readFileSync(absolute)) }
    : undefined;
}

function insideWorkTree(packageRoot: string): boolean {
  const probe = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd: packageRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return probe.status === 0 && probe.stdout.trim() === "true";
}

/** Tracked and untracked files git does not ignore, relative to the package root. */
function gitFiles(packageRoot: string): string[] {
  const listed = spawnSync(
    "git",
    ["ls-files", "-co", "--exclude-standard", "-z"],
    {
      cwd: packageRoot,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (listed.status !== 0) {
    throw new Error(
      `git ls-files could not list the package's files: ${listed.stderr || listed.error?.message}`,
    );
  }
  return [...new Set(listed.stdout.split("\0").filter(Boolean))];
}

/**
 * Every file under the package root, by POSIX path, without entering a
 * directory `included` rejects. Throws when a directory cannot be read.
 */
function walkedFiles(
  packageRoot: string,
  included: (path: string) => boolean,
): string[] {
  const files: string[] = [];
  const visit = (directory: string, prefix: string) => {
    let entries: Dirent[];
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch (error) {
      throw new Error(
        `the package directory ${prefix || "."} cannot be read: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
    for (const entry of entries) {
      const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (!included(path)) continue;
      if (entry.isDirectory()) {
        visit(join(directory, entry.name), path);
      } else {
        files.push(path);
      }
    }
  };
  visit(packageRoot, "");
  return files;
}

/**
 * The files the package revision reads, with their digests: what git tracks
 * or would track inside a work tree, every file otherwise. Leaves out
 * node_modules, .git, .ph, a build's stage, and each excluded path (the
 * output directory, compiler outputs) with what is under it.
 */
export function revisionFiles(
  packageRoot: string,
  excluded: readonly string[],
): FileDigest[] {
  const included = (path: string) =>
    !path
      .split("/")
      .some(
        (segment) =>
          ALWAYS_EXCLUDED.has(segment) || BUILD_SCRATCH.test(segment),
      ) &&
    !excluded.some(
      (exclusion) => path === exclusion || path.startsWith(`${exclusion}/`),
    );
  const paths = insideWorkTree(packageRoot)
    ? gitFiles(packageRoot)
    : walkedFiles(packageRoot, included);
  return paths
    .filter(included)
    .flatMap((path) => digestOf(packageRoot, path) ?? [])
    .sort(byPath);
}

/**
 * What `npm pack` publishes from the package root, with digests read from the
 * packed tarball. Workspaces are off, so npm packs the root package or
 * refuses; a tarball of another package than the root's package.json names
 * throws as well.
 */
export function publishedFiles(packageRoot: string): FileDigest[] {
  const packed = packRelease(packageRoot);
  try {
    return packedDigests(packed);
  } finally {
    packed.dispose();
  }
}

const approvalFile = (packageRoot: string) =>
  join(packageRoot, ...RELEASE_APPROVAL_PATH.split("/"));

export function readReleaseApproval(packageRoot: string): ApprovalRead {
  const file = approvalFile(packageRoot);
  if (!existsSync(file)) return { kind: "missing" };
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    return {
      kind: "unreadable",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
  return parseReleaseApproval(text);
}

/** Replaces the approval in one rename, so a reader never sees half of one. */
export function writeReleaseApproval(
  packageRoot: string,
  approval: ReleaseApproval,
): void {
  const file = approvalFile(packageRoot);
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(approval, null, 2)}\n`);
    renameSync(temporary, file);
  } finally {
    rmSync(temporary, { force: true });
  }
}
