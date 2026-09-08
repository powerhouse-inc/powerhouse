import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { compareCodeUnits, normalizePath, sha256 } from "./utils.js";

export type ArtifactFile = {
  readonly path: string;
  readonly bytes: number;
  readonly digest: `sha256:${string}`;
};

let stagingSequence = 0;

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new DOMException(
    "The artifact publication was cancelled.",
    "AbortError",
  );
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function collectFiles(root: string, directory = root): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((left, right) =>
    compareCodeUnits(left.name, right.name),
  )) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(root, path)));
    else if (entry.isFile()) files.push(path);
  }
  return files.sort((left, right) =>
    compareCodeUnits(
      normalizePath(relative(root, left)),
      normalizePath(relative(root, right)),
    ),
  );
}

export async function buildArtifactFileManifest(
  root: string,
): Promise<readonly ArtifactFile[]> {
  const files = await collectFiles(root);
  return Promise.all(
    files.map(async (path) => {
      const bytes = await readFile(path);
      return {
        path: normalizePath(relative(root, path)),
        bytes: bytes.byteLength,
        digest: sha256(bytes),
      };
    }),
  );
}

export async function publishArtifactSet(request: {
  readonly destination: string;
  readonly signal?: AbortSignal;
  readonly write: (stagingDirectory: string) => Promise<void>;
}): Promise<readonly ArtifactFile[]> {
  throwIfAborted(request.signal);
  if (await exists(request.destination)) {
    throw new Error(
      `Artifact destination already exists: ${basename(request.destination)}`,
    );
  }

  await mkdir(dirname(request.destination), { recursive: true });
  stagingSequence += 1;
  const stagingDirectory = `${request.destination}.staging-${process.pid}-${stagingSequence}`;
  await mkdir(stagingDirectory);

  try {
    await request.write(stagingDirectory);
    throwIfAborted(request.signal);
    const files = await buildArtifactFileManifest(stagingDirectory);
    await writeFile(
      join(stagingDirectory, "artifact-manifest.json"),
      `${JSON.stringify({ formatVersion: 1, files }, null, 2)}\n`,
      "utf8",
    );
    throwIfAborted(request.signal);
    await rename(stagingDirectory, request.destination);
    return files;
  } catch (error) {
    await rm(stagingDirectory, { recursive: true, force: true });
    throw error;
  }
}
