import type {
  DefinitionDiagnostic,
  Sha256Digest,
} from "@powerhousedao/shared/document-model";
import {
  pathWithin,
  realPathThroughExistingParent,
} from "@powerhousedao/shared/clis/real-paths";
import { realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { adaptCodeFirstDocumentModelSource } from "../adapters/code-first-document-model-source-adapter.js";
import type {
  DefinitionProducer,
  ProducedDefinitions,
} from "../adapters/producer.js";
import { compareArtifacts, sortedUniqueDiagnostics } from "../report/status.js";
import type { LoadedDefinitionProject } from "../report/types.js";
import type { DefinitionSourceLoader } from "../definition-source-loader.js";
import { readConfigObject } from "../definition-source-resolution.js";
import { toolingDiagnostics } from "../diagnostic-codes.js";
import { readStoredDocumentModels } from "../schema-first/stored-models.js";
import { findUnregisteredDefinitions } from "./unregistered-definitions.js";

/**
 * @experimental A package's document models, loaded once and read by both
 * `ph model check` and `ph model inspect`. Experimental while code-first
 * projects are introduced.
 */
export type ProjectDefinitions = LoadedDefinitionProject & {
  /** Absolute. No report carries it. */
  readonly packageRoot: string;
};

const DEFAULT_DOCUMENT_MODELS_DIR = "./document-models";

/** Code-first sources are authored in normalized coordinates, so they need no relocation. */
const adaptSelectedModules: DefinitionProducer = ({ loaded }) => {
  const results = loaded.documentModels.map(({ value, source }) => {
    const result = adaptCodeFirstDocumentModelSource(value, source);
    return {
      artifacts: result.artifacts,
      diagnostics: result.diagnostics.map((diagnostic) =>
        diagnostic.source === undefined
          ? { ...diagnostic, source }
          : diagnostic,
      ),
    };
  });
  return {
    artifacts: results.flatMap(({ artifacts }) => artifacts),
    diagnostics: results.flatMap(({ diagnostics }) => diagnostics),
    relocations: new Map(),
  };
};

/** The readers a project loads with unless a caller passes its own; the one place an authoring mode is named. */
export const defaultDefinitionProducers: readonly DefinitionProducer[] =
  Object.freeze([adaptSelectedModules, readStoredDocumentModels]);

/** A path that cannot be inspected is left to the readers, which report it. */
function namesNonDirectory(path: string): boolean {
  try {
    return statSync(path, { throwIfNoEntry: false })?.isDirectory() === false;
  } catch {
    return false;
  }
}

/** The configured models directory, or why it cannot be scanned. */
function documentModelsDirectory(
  packageRoot: string,
  configFile: string,
): {
  readonly path?: string;
  readonly diagnostics: readonly DefinitionDiagnostic[];
} {
  const config = readConfigObject(resolve(configFile));
  // The loader already reported an unreadable config.
  if (!config.ok) return { diagnostics: [] };
  const configured =
    config.value.documentModelsDir ?? DEFAULT_DOCUMENT_MODELS_DIR;
  if (typeof configured !== "string" || configured.trim() === "") {
    return {
      diagnostics: [
        toolingDiagnostics.create({
          code: "PH-CONFIG-SOURCE-INVALID",
          path: ["documentModelsDir"],
          message: "documentModelsDir is not a directory path.",
          expected: "a package-relative path such as ./document-models",
          received: JSON.stringify(configured),
          repair:
            "Set documentModelsDir to a package-relative directory, or remove it to use ./document-models.",
        }),
      ],
    };
  }
  const path = resolve(packageRoot, configured);
  let inside = pathWithin(packageRoot, path) !== null;
  try {
    inside &&=
      pathWithin(
        realpathSync.native(packageRoot),
        realPathThroughExistingParent(path),
      ) !== null;
  } catch {
    inside = false;
  }
  if (!inside) {
    return {
      diagnostics: [
        toolingDiagnostics.create({
          code: "PH-CONFIG-SOURCE-OUTSIDE-PACKAGE",
          path: ["documentModelsDir"],
          message:
            "documentModelsDir leaves the package root, so its models are not this package's.",
          expected: "a directory inside the package",
          received: configured,
          repair: "Point documentModelsDir at a directory inside the package.",
        }),
      ],
    };
  }
  if (namesNonDirectory(path)) {
    return {
      diagnostics: [
        toolingDiagnostics.create({
          code: "PH-CONFIG-SOURCE-INVALID",
          path: ["documentModelsDir"],
          message: "documentModelsDir names a file, not a directory.",
          expected: "a package-relative directory such as ./document-models",
          received: configured,
          repair:
            "Point documentModelsDir at the directory that holds the models, or remove it to use ./document-models.",
        }),
      ],
    };
  }
  return { path, diagnostics: [] };
}

/** Tool and Node messages can quote the machine path a package lives at. */
function packageRelative(
  diagnostics: readonly DefinitionDiagnostic[],
  packageRoot: string,
): readonly DefinitionDiagnostic[] {
  let real = packageRoot;
  try {
    real = realpathSync.native(packageRoot);
  } catch {
    // An unreadable root keeps its spelled path only.
  }
  const roots = [...new Set([packageRoot, real])]
    .sort((left, right) => right.length - left.length)
    .flatMap((root) => [pathToFileURL(root).href, root]);
  const rewrite = (text: string) =>
    roots.reduce((result, root) => result.replaceAll(root, "."), text);
  return diagnostics.map((diagnostic) => ({
    ...diagnostic,
    message: rewrite(diagnostic.message),
    repair: rewrite(diagnostic.repair),
    ...(diagnostic.expected !== undefined && {
      expected: rewrite(diagnostic.expected),
    }),
    ...(diagnostic.received !== undefined && {
      received: rewrite(diagnostic.received),
    }),
    ...(diagnostic.related !== undefined && {
      related: diagnostic.related.map((location) => ({
        ...location,
        message: rewrite(location.message),
      })),
    }),
  }));
}

/**
 * @experimental Loads the selected code-first sources and the package's stored
 * schema-first models, and scans for code-first declarations no source
 * reaches. Artifacts and diagnostics are sorted and package relative.
 * `producers` replaces the default readers. `importedFiles` names the
 * absolute paths of every module the loader's import of a selected
 * specifier evaluated, so reach follows whatever the importer resolved.
 * Experimental while code-first projects are introduced.
 */
export async function loadProjectDefinitions(request: {
  readonly loader: DefinitionSourceLoader;
  readonly configFile: string;
  readonly packageRevision: Sha256Digest;
  readonly signal?: AbortSignal;
  readonly producers?: readonly DefinitionProducer[];
  readonly importedFiles: (specifier: string) => readonly string[];
}): Promise<ProjectDefinitions> {
  const {
    loader,
    producers = defaultDefinitionProducers,
    importedFiles,
    ...load
  } = request;
  const loaded = await loader.normalizeDefinitionSources(load);
  request.signal?.throwIfAborted();
  const { packageRoot } = loaded;
  const directory = documentModelsDirectory(packageRoot, request.configFile);
  const modelsDir = directory.path;
  const input = {
    ...load,
    loader,
    packageRoot,
    loaded,
    ...(modelsDir !== undefined && { documentModelsDir: modelsDir }),
  };
  const produced: ProducedDefinitions[] = [];
  for (const producer of producers) produced.push(await producer(input));
  request.signal?.throwIfAborted();
  const selectionKnown = !loaded.diagnostics.some(
    ({ phase, severity }) => phase === "configuration" && severity === "error",
  );
  const scan =
    selectionKnown && modelsDir !== undefined
      ? findUnregisteredDefinitions({
          packageRoot,
          documentModelsDir: modelsDir,
          sources: loaded.sourceSet.sources,
          importedFiles,
          loadedDocumentTypes: new Set([
            ...loaded.documentModels.map(
              ({ value }) => value.documentModel.global.id,
            ),
            ...loaded.diagnostics.flatMap(({ definition }) =>
              definition?.kind === "document-model" ? [definition.key] : [],
            ),
          ]),
        })
      : { unregistered: [], diagnostics: [] };
  return {
    packageRoot,
    sourceSet: loaded.sourceSet,
    ...(loaded.status === "skipped" && { skipReason: loaded.skipReason }),
    artifacts: produced
      .flatMap(({ artifacts }) => artifacts)
      .sort(compareArtifacts),
    relocations: new Map(
      produced.flatMap(({ relocations }) => [...relocations]),
    ),
    diagnostics: sortedUniqueDiagnostics(
      packageRelative(
        [
          ...loaded.diagnostics,
          ...directory.diagnostics,
          ...produced.flatMap(({ diagnostics }) => diagnostics),
          ...scan.diagnostics,
        ],
        packageRoot,
      ),
    ),
    unregistered: scan.unregistered,
  };
}
