import {
  pathWithin,
  realPathThroughExistingParent,
} from "@powerhousedao/shared/clis/real-paths";
import { createHash } from "node:crypto";
import { realpathSync, statSync } from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";
import { listFiles, readText } from "./project-fs.js";

export const MANIFEST_FILE = "powerhouse.manifest.json";
export const CONFIG_FILE = "powerhouse.config.json";
export const EDITORS_DIR = "editors";
export const SUBGRAPHS_DIR = "subgraphs";
export const PROCESSORS_DIR = "processors";

const DEFAULT_DOCUMENT_MODELS_DIR = "document-models";

/** `scalars/index.ts` is an input of every stored model, wherever the models are. */
const SCALARS_DIR = "scalars";

/**
 * The config's `documentModelsDir` as a POSIX path relative to the project.
 * It mirrors the loader's `resolveDocumentModelsDir` (document-model's
 * `tooling/model-directories.ts`), which this module cannot import without
 * loading the definition tooling into every dev server. Where the loader
 * refuses the directory the models are not read at all, so the default is
 * answered.
 */
export function documentModelsDirOf(root: string): string {
  try {
    const { documentModelsDir } = JSON.parse(
      readText(root, CONFIG_FILE) ?? "{}",
    ) as { documentModelsDir?: unknown };
    if (
      typeof documentModelsDir !== "string" ||
      documentModelsDir.trim() === ""
    ) {
      return DEFAULT_DOCUMENT_MODELS_DIR;
    }
    const path = resolve(root, documentModelsDir);
    const inside = pathWithin(root, path);
    const real = pathWithin(
      realpathSync.native(root),
      realPathThroughExistingParent(path),
    );
    return inside === null || inside === "" || real === null
      ? DEFAULT_DOCUMENT_MODELS_DIR
      : inside.split(sep).join("/");
  } catch {
    return DEFAULT_DOCUMENT_MODELS_DIR;
  }
}

/** Hashes each path with its modification time and size, without reading it. */
function fingerprint(root: string, paths: readonly string[]): string {
  const hash = createHash("sha256");
  for (const path of paths) {
    const stats = statSync(isAbsolute(path) ? path : join(root, path), {
      throwIfNoEntry: false,
    });
    hash.update(
      stats === undefined
        ? `${path}\0missing\n`
        : `${path}\0${stats.mtimeMs}\0${stats.size}\n`,
    );
  }
  return hash.digest("hex");
}

/** The files of the models directory and of the project's scalars, relative to the project. */
export function modelsFiles(root: string): string[] {
  return [
    ...listFiles(root, documentModelsDirOf(root)),
    ...listFiles(root, SCALARS_DIR),
  ];
}

/**
 * What a read of the document models depends on: the models directory, the
 * project's scalars, the config, and `imported`, the absolute files the
 * last read's code-first sources evaluated, which can be anywhere.
 */
export function modelsFingerprint(
  root: string,
  imported: readonly string[],
): string {
  return fingerprint(root, [...modelsFiles(root), CONFIG_FILE, ...imported]);
}

/** What the other sections depend on. `tsconfig.json` is here because they
 * cannot be read without it. */
export function modulesFingerprint(root: string): string {
  return fingerprint(root, [
    ...[EDITORS_DIR, SUBGRAPHS_DIR, PROCESSORS_DIR].flatMap((dir) =>
      listFiles(root, dir),
    ),
    MANIFEST_FILE,
    "tsconfig.json",
  ]);
}

/** One short token for the response's `ETag`. */
export function revisionOf(...parts: readonly (string | number)[]): string {
  return createHash("sha256")
    .update(parts.join("\0"))
    .digest("hex")
    .slice(0, 16);
}
