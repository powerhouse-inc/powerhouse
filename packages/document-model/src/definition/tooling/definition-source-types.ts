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
 * @experimental The selected sources, exactly as a definition report carries
 * them. Defined from the stored report type so the two cannot disagree.
 */
export type DefinitionSourceSet = DefinitionCheckReport["sourceSet"];

/** @experimental Where the selected source list came from. */
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

/** @experimental */
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

/** @experimental A selection, resolved without importing anything. */
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
  readonly documentModels: readonly LoadedDefinition<DocumentModelModule>[];
  readonly upgradeManifests: readonly LoadedDefinition<
    UpgradeManifest<readonly number[]>
  >[];
};
