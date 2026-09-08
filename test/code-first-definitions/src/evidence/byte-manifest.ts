import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { compareCodeUnits, normalizePath, sha256 } from "./utils.js";

export type ByteManifestEntry = {
  readonly path: string;
  readonly bytes: number;
  readonly digest: `sha256:${string}`;
};

async function walk(root: string, directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries.sort((left, right) =>
    compareCodeUnits(left.name, right.name),
  )) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...(await walk(root, path)));
    else if (entry.isFile()) paths.push(path);
  }
  return paths;
}

export async function createByteManifest(
  root: string,
): Promise<readonly ByteManifestEntry[]> {
  const paths = await walk(root, root);
  const entries = await Promise.all(
    paths.map(async (path) => {
      const value = await readFile(path);
      return {
        path: normalizePath(relative(root, path)),
        bytes: value.byteLength,
        digest: sha256(value),
      };
    }),
  );
  return entries.sort((left, right) => compareCodeUnits(left.path, right.path));
}
