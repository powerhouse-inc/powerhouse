import {
  compareCodeUnits,
  relativePathWithin,
  sha256 as sha256Digest,
  toPosixPath,
} from "document-model/tooling";
import { createHash, type Hash } from "node:crypto";
import { constants, type BigIntStats } from "node:fs";
import {
  lstat,
  open,
  readdir,
  readlink,
  realpath,
  type FileHandle,
  unlink,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

type SymlinkErrorFactory = (path: string) => Error;

type FileTreeOptions = {
  readonly ignoredDirectoryNames?: ReadonlySet<string>;
  readonly ignoredPaths?: readonly string[];
};

type ReadFileTreeOptions = FileTreeOptions & {
  readonly includeFile?: (path: string) => boolean;
  readonly symlinks?: "reject" | "internal-files";
};

type WalkedFile =
  | {
      readonly kind: "file";
      readonly path: string;
      readonly contents?: Buffer;
    }
  | {
      readonly kind: "symlink";
      readonly path: string;
      readonly contents: Buffer;
      readonly linkTarget: string;
      readonly targetPath: string;
    };

export type ReadFileTreeEntry =
  | {
      readonly kind: "file";
      readonly path: string;
      readonly contents: Buffer;
    }
  | Extract<WalkedFile, { readonly kind: "symlink" }>;

export { relativePathWithin, sha256Digest, toPosixPath };

export function createRelativeSymlinkErrorFactory<ErrorType extends Error>(
  root: string,
  label: string,
  createError: (message: string) => ErrorType,
): SymlinkErrorFactory {
  return (path) =>
    createError(
      `${label} ${toPosixPath(relative(root, path))} is a symbolic link.`,
    );
}

export function isVisibleDirectoryBasename(value: string): boolean {
  return (
    value.length > 0 &&
    value.trim() === value &&
    !value.startsWith(".") &&
    !value.includes("/") &&
    !value.includes("\\") &&
    !/\p{Cc}/u.test(value)
  );
}

export async function assertNoSymlinks(
  root: string,
  path: string,
  symlinkError: SymlinkErrorFactory,
): Promise<void> {
  const child = relative(root, path);
  if (child === ".." || child.startsWith(`..${sep}`) || isAbsolute(child)) {
    throw new RangeError("The checked path must stay inside its root.");
  }

  let current = root;
  for (const segment of child.split(sep).filter(Boolean)) {
    current = join(current, segment);
    try {
      if ((await lstat(current)).isSymbolicLink()) {
        throw symlinkError(current);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }
}

export function updateLengthPrefixedHash(
  hash: Hash,
  value: string | Uint8Array,
): void {
  const bytes = typeof value === "string" ? Buffer.from(value) : value;
  hash.update(String(bytes.byteLength), "utf8");
  hash.update(":", "utf8");
  hash.update(bytes);
  hash.update(";", "utf8");
}

const NO_FOLLOW_ERROR_CODES = new Set(["ELOOP", "EMLINK"]);

function isNoFollowError(error: unknown): boolean {
  return NO_FOLLOW_ERROR_CODES.has((error as NodeJS.ErrnoException).code ?? "");
}

function treeChangedError(root: string, path: string): Error {
  const relativePath = toPosixPath(relative(root, path)) || ".";
  return new Error(
    `File tree changed while it was being read at ${relativePath}.`,
  );
}

function sameIdentity(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameStableMetadata(left: BigIntStats, right: BigIntStats): boolean {
  return (
    sameIdentity(left, right) &&
    left.mode === right.mode &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

async function canonicalPath(
  root: string,
  rootIdentity: string,
  path: string,
): Promise<string> {
  let identity: string;
  try {
    identity = await realpath(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw treeChangedError(root, path);
    }
    throw error;
  }
  const expected = resolve(rootIdentity, relative(root, path));
  if (identity !== expected) throw treeChangedError(root, path);
  return identity;
}

async function assertCanonicalParent(
  root: string,
  rootIdentity: string,
  path: string,
): Promise<void> {
  await canonicalPath(root, rootIdentity, path === root ? root : dirname(path));
}

async function lstatMetadata(
  root: string,
  rootIdentity: string,
  path: string,
): Promise<BigIntStats> {
  await assertCanonicalParent(root, rootIdentity, path);
  let metadata: BigIntStats;
  try {
    metadata = await lstat(path, { bigint: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw treeChangedError(root, path);
    }
    throw error;
  }
  await assertCanonicalParent(root, rootIdentity, path);
  return metadata;
}

async function pathMetadata(
  root: string,
  rootIdentity: string,
  path: string,
  symlinkError: SymlinkErrorFactory,
): Promise<BigIntStats> {
  const metadata = await lstatMetadata(root, rootIdentity, path);
  if (metadata.isSymbolicLink()) throw symlinkError(path);
  await canonicalPath(root, rootIdentity, path);
  return metadata;
}

async function openNoFollow(
  path: string,
  flags: number,
  symlinkError: SymlinkErrorFactory,
): Promise<FileHandle> {
  try {
    return await open(path, flags);
  } catch (error) {
    if (isNoFollowError(error)) throw symlinkError(path);
    throw error;
  }
}

async function inspectFile(
  root: string,
  rootIdentity: string,
  path: string,
  expected: BigIntStats,
  symlinkError: SymlinkErrorFactory,
  readContents: boolean,
): Promise<Buffer | undefined> {
  const handle = await openNoFollow(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    symlinkError,
  );
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || !sameIdentity(expected, before)) {
      throw treeChangedError(root, path);
    }
    const contents = readContents ? await handle.readFile() : undefined;
    const after = await handle.stat({ bigint: true });
    const current = await pathMetadata(root, rootIdentity, path, symlinkError);
    if (
      !after.isFile() ||
      !sameStableMetadata(before, after) ||
      !current.isFile() ||
      !sameIdentity(after, current)
    ) {
      throw treeChangedError(root, path);
    }
    return contents;
  } finally {
    await handle.close();
  }
}

async function inspectInternalFileSymlink(
  root: string,
  rootIdentity: string,
  path: string,
  expected: BigIntStats,
  symlinkError: SymlinkErrorFactory,
): Promise<Extract<WalkedFile, { readonly kind: "symlink" }>> {
  const before = await lstatMetadata(root, rootIdentity, path);
  if (!before.isSymbolicLink() || !sameIdentity(expected, before)) {
    throw treeChangedError(root, path);
  }

  let linkTarget: string;
  let targetIdentity: string;
  try {
    [linkTarget, targetIdentity] = await Promise.all([
      readlink(path),
      realpath(path),
    ]);
  } catch {
    throw symlinkError(path);
  }
  if (relativePathWithin(rootIdentity, targetIdentity) === null) {
    throw symlinkError(path);
  }

  const targetMetadata = await pathMetadata(
    rootIdentity,
    rootIdentity,
    targetIdentity,
    () => symlinkError(path),
  );
  if (!targetMetadata.isFile()) throw symlinkError(path);
  const contents = await inspectFile(
    rootIdentity,
    rootIdentity,
    targetIdentity,
    targetMetadata,
    () => symlinkError(path),
    true,
  );
  if (!contents) throw treeChangedError(root, path);

  const after = await lstatMetadata(root, rootIdentity, path);
  let finalTarget: string;
  let finalLinkTarget: string;
  try {
    [finalLinkTarget, finalTarget] = await Promise.all([
      readlink(path),
      realpath(path),
    ]);
  } catch {
    throw symlinkError(path);
  }
  if (
    !after.isSymbolicLink() ||
    !sameStableMetadata(before, after) ||
    finalLinkTarget !== linkTarget ||
    finalTarget !== targetIdentity
  ) {
    throw treeChangedError(root, path);
  }
  return {
    kind: "symlink",
    path,
    contents,
    linkTarget,
    targetPath: toPosixPath(relative(rootIdentity, targetIdentity)),
  };
}

async function walkFileTree(
  root: string,
  symlinkError: SymlinkErrorFactory,
  options: ReadFileTreeOptions,
): Promise<readonly WalkedFile[]> {
  const files: WalkedFile[] = [];
  const rootIdentity = await realpath(root);

  // Node does not expose a portable openat/readdir-by-descriptor API. Repeated
  // canonical-path, inode, and directory-list checks make observable ancestor
  // swaps fail closed. A perfectly timed, identical ABA swap remains a platform
  // limit until traversal can be bound to directory handles everywhere.

  async function visit(
    directory: string,
    expected?: BigIntStats,
  ): Promise<void> {
    const discovered =
      expected ??
      (await pathMetadata(root, rootIdentity, directory, symlinkError));
    const before = await pathMetadata(
      root,
      rootIdentity,
      directory,
      symlinkError,
    );
    if (!before.isDirectory() || !sameIdentity(discovered, before)) {
      throw treeChangedError(root, directory);
    }
    const entries = await readdir(directory, { withFileTypes: true });
    const afterRead = await pathMetadata(
      root,
      rootIdentity,
      directory,
      symlinkError,
    );
    if (!afterRead.isDirectory() || !sameStableMetadata(before, afterRead)) {
      throw treeChangedError(root, directory);
    }

    entries.sort((left, right) => compareCodeUnits(left.name, right.name));
    const confirmedEntries = await readdir(directory, { withFileTypes: true });
    confirmedEntries.sort((left, right) =>
      compareCodeUnits(left.name, right.name),
    );
    if (
      entries.length !== confirmedEntries.length ||
      entries.some(
        (entry, index) => entry.name !== confirmedEntries[index]?.name,
      )
    ) {
      throw treeChangedError(root, directory);
    }
    const afterConfirmation = await pathMetadata(
      root,
      rootIdentity,
      directory,
      symlinkError,
    );
    if (
      !afterConfirmation.isDirectory() ||
      !sameStableMetadata(before, afterConfirmation)
    ) {
      throw treeChangedError(root, directory);
    }

    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (
        options.ignoredPaths?.some(
          (ignoredPath) => relativePathWithin(ignoredPath, path) !== null,
        )
      ) {
        continue;
      }
      const child = await lstatMetadata(root, rootIdentity, path);
      if (child.isSymbolicLink()) {
        if (options.symlinks !== "internal-files") throw symlinkError(path);
        files.push(
          await inspectInternalFileSymlink(
            root,
            rootIdentity,
            path,
            child,
            symlinkError,
          ),
        );
      } else if (child.isDirectory()) {
        if (!options.ignoredDirectoryNames?.has(entry.name)) {
          await visit(path, child);
        }
      } else if (child.isFile()) {
        files.push({
          kind: "file",
          path,
          contents: await inspectFile(
            root,
            rootIdentity,
            path,
            child,
            symlinkError,
            options.includeFile?.(path) ?? false,
          ),
        });
      }
    }

    const after = await pathMetadata(
      root,
      rootIdentity,
      directory,
      symlinkError,
    );
    if (!after.isDirectory() || !sameStableMetadata(before, after)) {
      throw treeChangedError(root, directory);
    }
  }

  await visit(root);
  return files.sort((left, right) =>
    compareCodeUnits(toPosixPath(left.path), toPosixPath(right.path)),
  );
}

export async function writeFileIfAbsentOrEqual(
  root: string,
  path: string,
  contents: string,
  symlinkError: SymlinkErrorFactory,
): Promise<boolean> {
  await assertNoSymlinks(root, path, symlinkError);
  const parent = dirname(path);
  const rootIdentity = await realpath(root);
  const parentIdentity = await realpath(parent);
  const expectedParentIdentity = resolve(rootIdentity, relative(root, parent));
  if (parentIdentity !== expectedParentIdentity) throw symlinkError(parent);
  const parentBefore = await pathMetadata(
    rootIdentity,
    rootIdentity,
    parentIdentity,
    symlinkError,
  );
  if (!parentBefore.isDirectory()) throw treeChangedError(root, parent);
  const target = join(parentIdentity, basename(path));

  let handle: FileHandle;
  let created = false;
  try {
    handle = await openNoFollow(
      target,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      symlinkError,
    );
    created = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    handle = await openNoFollow(
      target,
      constants.O_RDONLY | constants.O_NOFOLLOW,
      symlinkError,
    );
  }

  let createdIdentity: BigIntStats | undefined;
  let result = false;
  let failure: Error | undefined;
  try {
    const before = await handle.stat({ bigint: true });
    if (before.isFile()) {
      if (created) {
        createdIdentity = before;
        await handle.writeFile(contents, { encoding: "utf8" });
      }
      const value = created ? contents : await handle.readFile("utf8");
      const after = await handle.stat({ bigint: true });
      const current = await pathMetadata(
        rootIdentity,
        rootIdentity,
        target,
        symlinkError,
      );
      const parentAfter = await pathMetadata(
        rootIdentity,
        rootIdentity,
        parentIdentity,
        symlinkError,
      );
      if (
        !after.isFile() ||
        !(created
          ? sameIdentity(before, after)
          : sameStableMetadata(before, after)) ||
        !current.isFile() ||
        !sameIdentity(after, current) ||
        !parentAfter.isDirectory() ||
        !sameIdentity(parentBefore, parentAfter)
      ) {
        throw treeChangedError(root, path);
      }
      result = value === contents;
    }
  } catch (error) {
    failure =
      error instanceof Error
        ? error
        : new Error("The file-tree write failed.", { cause: error });
  } finally {
    await handle.close();
  }

  if (failure !== undefined) {
    if (createdIdentity) {
      // Node has no portable unlinkat API. Remove only when the canonical path
      // still names the inode created through the open handle; otherwise leave
      // it untouched rather than risk deleting an unrelated replacement.
      try {
        const current = await pathMetadata(
          rootIdentity,
          rootIdentity,
          target,
          symlinkError,
        );
        if (current.isFile() && sameIdentity(createdIdentity, current)) {
          await unlink(target);
        }
      } catch {
        // The path is no longer a safe name for the file that was created.
      }
    }
    throw failure;
  }
  return result;
}

export async function listTreeFiles(
  root: string,
  symlinkError: SymlinkErrorFactory,
  options: FileTreeOptions = {},
): Promise<readonly string[]> {
  return (await walkFileTree(root, symlinkError, options)).map(
    ({ path }) => path,
  );
}

export async function readFileTree(
  root: string,
  symlinkError: SymlinkErrorFactory,
  options: ReadFileTreeOptions = {},
): Promise<readonly ReadFileTreeEntry[]> {
  const files = await walkFileTree(root, symlinkError, {
    ...options,
    includeFile: options.includeFile ?? (() => true),
  });
  return files.filter((file): file is ReadFileTreeEntry => {
    return file.kind === "symlink" || file.contents !== undefined;
  });
}

export async function snapshotFileTree(
  root: string,
  symlinkError: SymlinkErrorFactory,
): Promise<{
  readonly files: readonly string[];
  readonly digest: `sha256:${string}`;
}> {
  const entries = await readFileTree(root, symlinkError);
  const hash = createHash("sha256");
  hash.update("powerhouse-file-tree-v1\0", "utf8");
  for (const { path, contents } of entries) {
    updateLengthPrefixedHash(hash, toPosixPath(relative(root, path)));
    updateLengthPrefixedHash(hash, contents);
  }
  return {
    files: entries.map(({ path }) => path),
    digest: `sha256:${hash.digest("hex")}`,
  };
}
