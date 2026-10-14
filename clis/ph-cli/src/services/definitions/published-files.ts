import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import { filesDigest } from "./package-revision.js";
import { canonicalPath, pathWithin, scratchDirectory } from "./paths.js";
import { copyPackageForPack } from "./package-copy.js";

export type PublishedFileSet = {
  readonly files: readonly string[];
  readonly digest: string;
};

const packListingSchema = z
  .array(z.object({ files: z.array(z.object({ path: z.string() })) }))
  .length(1);

export function packedFileList(stdout: string): string[] {
  return packListingSchema
    .parse(JSON.parse(stdout))
    .flatMap((pack) => pack.files.map((file) => file.path))
    .sort();
}

export function listPublishedFiles(packageRoot: string): string[] {
  const scratch = scratchDirectory(packageRoot);
  const entry = join(packageRoot, ".ph", "build");
  if (canonicalPath(entry, { resolveMissingLinks: true }) !== scratch)
    throw new Error(
      "The retained scratch root moved; rebuild before listing published files.",
    );
  mkdirSync(scratch, { recursive: true });
  // A canonical destination under a linked .ph can look like a copy into itself.
  const copy = mkdtempSync(join(entry, "listing-"));
  try {
    copyPackageForPack(packageRoot, copy);
    const packed = spawnSync(
      "npm",
      ["pack", "--dry-run", "--json", "--ignore-scripts"],
      {
        cwd: copy,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        shell: process.platform === "win32",
      },
    );
    if (packed.status !== 0)
      throw new Error(
        `The published file set could not be checked: ${packed.stderr || packed.error?.message || packed.stdout}`,
      );
    return packedFileList(packed.stdout);
  } finally {
    rmSync(copy, { recursive: true, force: true });
  }
}

export function publishedFileSetDigest(
  packageRoot: string,
  outDir: string,
  publishedFiles: readonly string[],
  digestRoot = packageRoot,
): string {
  const output = resolve(packageRoot, outDir);
  const canonicalOutput = canonicalPath(output);
  const scratch = scratchDirectory(packageRoot);
  const files = publishedFiles
    .filter((path) => {
      const file = canonicalPath(resolve(packageRoot, path), {
        resolveMissingLinks: true,
      });
      return (
        pathWithin(output, resolve(packageRoot, path)) === null &&
        pathWithin(canonicalOutput, file) === null &&
        pathWithin(scratch, file) === null
      );
    })
    .sort();
  return filesDigest(digestRoot, files);
}
