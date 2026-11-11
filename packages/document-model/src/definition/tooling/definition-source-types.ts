import type { DocumentModelDirectory } from "./model-directories.js";
import type {
  DefinitionCheckReport,
  DefinitionCheckSkipReason,
  DefinitionDiagnostic,
  DefinitionPath,
  DefinitionSource,
  DocumentModelModule,
  Sha256Digest,
  UpgradeManifest,
} from "@powerhousedao/shared/document-model";

/**
 * @experimental The discovered sources, exactly as a definition report
 * carries them. Defined from the stored report type so the two cannot
 * disagree.
 */
export type DefinitionSourceSet = DefinitionCheckReport["sourceSet"];

/** @experimental Whether discovery or a caller chose the sources. */
export type DefinitionSourceOrigin = DefinitionSourceSet["origin"];

/**
 * @experimental The loader's one substitutable dependency: something that
 * turns a package-relative TypeScript path into a module namespace. Codegen
 * supplies a Vite environment; a build can supply its own module graph.
 */
export interface TypeScriptSourceImportInterface {
  importModule(request: {
    readonly packageRoot: string;
    readonly specifier: `./${string}`;
    readonly packageRevision: Sha256Digest;
    readonly signal?: AbortSignal;
  }): Promise<Readonly<Record<string, unknown>>>;

  disposeRevision?(packageRevision?: Sha256Digest): Promise<void> | void;
}

/**
 * @experimental The package whose models are discovered: the directory of
 * `configFile`, read with the config's `documentModelsDir`. A missing config
 * fails unless `allowMissingConfig`, which then reads the default directory.
 */
export type DefinitionSourceSelectionRequest = {
  readonly configFile?: string;

  readonly allowMissingConfig?: boolean;
};

/** @experimental */
export type DefinitionSourceLoadRequest = DefinitionSourceSelectionRequest & {
  /**
   * Binds the imported bytes this load may reuse. A definition digest is not
   * enough: editing a reducer helper leaves every definition digest unchanged.
   */
  readonly packageRevision: Sha256Digest;
  readonly signal?: AbortSignal;
};

/** @experimental The discovered sources, resolved without importing anything. */
export type DefinitionSourceResolution = {
  readonly packageRoot: string;
  readonly sourceSet: DefinitionSourceSet;
  readonly diagnostics: readonly DefinitionDiagnostic[];
} & (
  | { readonly status: "ready" | "failed"; readonly skipReason?: never }
  | {
      readonly status: "skipped";
      readonly skipReason: DefinitionCheckSkipReason;
    }
);

/** @experimental One value the traversal recognized, and where it was found. */
export type LoadedDefinition<TValue> = {
  readonly source: DefinitionSource;

  readonly path: DefinitionPath;
  readonly value: TValue;
};

/** @experimental */
export type LoadedDefinitionSet = DefinitionSourceResolution & {
  /** Absolute; absent when the configured models directory cannot be read. */
  readonly documentModelsDir?: string;
  /** What discovery found in each model directory; absent for requested sources. */
  readonly directories?: readonly DocumentModelDirectory[];
  readonly documentModels: readonly LoadedDefinition<DocumentModelModule>[];
  readonly upgradeManifests: readonly LoadedDefinition<
    UpgradeManifest<readonly number[]>
  >[];
  /**
   * The sources that export a definition. A value several sources export is
   * listed above under the first one only, so a source that re-exports
   * another's definitions is named here and nowhere else.
   */
  readonly sourcesWithDefinitions: readonly DefinitionSource[];
};
