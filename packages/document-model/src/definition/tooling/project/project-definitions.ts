import type {
  DefinitionDiagnostic,
  Sha256Digest,
} from "@powerhousedao/shared/document-model";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { adaptCodeFirstDocumentModelSource } from "../adapters/code-first-document-model-source-adapter.js";
import type {
  DefinitionProducer,
  ProducedDefinitions,
} from "../adapters/producer.js";
import { compareArtifacts, sortedUniqueDiagnostics } from "../report/status.js";
import type { LoadedDefinitionProject } from "../report/types.js";
import type { DefinitionSourceLoader } from "../definition-source-loader.js";
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

/** The readers a project loads with unless a caller passes its own: code-first modules, then stored specifications. */
export const defaultDefinitionProducers: readonly DefinitionProducer[] =
  Object.freeze([adaptSelectedModules, readStoredDocumentModels]);

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
 * @experimental Loads the code-first model directories discovery finds and
 * the package's stored schema-first models, and scans for code-first
 * declarations no entry module reaches. Artifacts and diagnostics are
 * sorted and package relative. `producers` replaces the default readers.
 * `importedFiles` names the absolute paths of every module the loader's
 * import of a discovered specifier evaluated, so reach follows whatever the
 * importer resolved. Experimental while code-first projects are introduced.
 */
export async function loadProjectDefinitions(request: {
  readonly loader: DefinitionSourceLoader;
  readonly configFile: string;
  readonly allowMissingConfig?: boolean;
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
  const modelsDir = loaded.documentModelsDir;
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
  const artifacts = produced
    .flatMap((result) => result.artifacts)
    .sort(compareArtifacts);
  const scan =
    selectionKnown && modelsDir !== undefined
      ? findUnregisteredDefinitions({
          packageRoot,
          documentModelsDir: modelsDir,
          sources: loaded.sourceSet.sources,
          importedFiles,
          storedUnits: new Set(
            loaded.sourceSet.stored.map(({ specifier }) =>
              specifier.replace(/[^/]+$/, ""),
            ),
          ),
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
    ...(artifacts.length === 0 && {
      skipReason: "no-document-models" as const,
    }),
    artifacts,
    relocations: new Map(
      produced.flatMap(({ relocations }) => [...relocations]),
    ),
    diagnostics: sortedUniqueDiagnostics(
      packageRelative(
        [
          ...loaded.diagnostics,
          ...produced.flatMap(({ diagnostics }) => diagnostics),
          ...scan.diagnostics,
        ],
        packageRoot,
      ),
    ),
    unregistered: scan.unregistered,
  };
}
