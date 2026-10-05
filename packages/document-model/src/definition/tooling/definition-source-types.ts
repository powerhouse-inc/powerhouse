import type {
  DefinitionCheckReport,
  DefinitionDiagnostic,
  DefinitionPath,
  DefinitionSource,
  DocumentModelModule,
  Sha256Digest,
  UpgradeManifest,
} from "@powerhousedao/shared/document-model";
import type { ScalarBinding } from "../scalars/types.js";

/**
 * The selected source list, exactly as a report carries it. Defined from the
 * wire type rather than beside it, so the two cannot drift into disagreement
 * about what "the selection" means.
 */
export type DefinitionSourceSet = DefinitionCheckReport["sourceSet"];

/** Where the selected source list came from. Visible in every report. */
export type DefinitionSourceOrigin = DefinitionSourceSet["origin"];

/**
 * The one substitutable dependency of the loader: something that can turn a
 * package-relative TypeScript path into a module namespace. Interactive
 * checking supplies a Vite environment; a build supplies its own build graph.
 * Both answer the same question, so neither can see a different definition.
 */
export interface TypeScriptSourceImportInterface {
  importModule(request: {
    readonly packageRoot: string;
    readonly specifier: `./${string}`;
    readonly packageRevision: Sha256Digest;
    readonly signal?: AbortSignal;
  }): Promise<Readonly<Record<string, unknown>>>;
  /**
   * Releases whatever the adapter bound to a superseded package revision. The
   * loader calls this when a newer revision replaces a cached one, so a watch
   * session does not accumulate one environment per keystroke.
   */
  disposeRevision?(packageRevision?: Sha256Digest): Promise<void> | void;
}

export type DefinitionSourceSelectionRequest = {
  /**
   * The config file that selects the package. Its directory is the package
   * root. Absent means `./powerhouse.config.json` in the working directory;
   * parent directories are never searched.
   */
  readonly configFile?: string;
  /** Raw `--source` values. Any value present replaces the config entries. */
  readonly cliSources?: readonly string[];
};

export type DefinitionSourceLoadRequest = DefinitionSourceSelectionRequest & {
  /**
   * Binds the imported dependency bytes, executable closures, and toolchain
   * this load may reuse. A definition digest is not enough: editing a reducer
   * helper leaves every definition digest unchanged.
   */
  readonly packageRevision: Sha256Digest;
  readonly signal?: AbortSignal;
};

export type DefinitionSourceResolution = {
  readonly status: "ready" | "failed" | "skipped";
  /** The directory of the selected config file. */
  readonly packageRoot: string;
  readonly sourceSet: DefinitionSourceSet;
  readonly diagnostics: readonly DefinitionDiagnostic[];
  /**
   * The one failure a caller may treat as something other than a failure: a
   * package that has not declared `definitionSources` at all. `ph build` warns
   * and keeps building for it during the compatibility window, so the
   * distinction is stated here rather than recovered from a diagnostic's
   * shape.
   */
  readonly reason?: "sources-undeclared";
};

/** One value the traversal recognised, with where it was found. */
export type LoadedDefinition<TValue> = {
  /** Specifier plus the complete export path down to this value. */
  readonly source: DefinitionSource;
  /** The path inside the selected export, for diagnostics. */
  readonly path: DefinitionPath;
  readonly value: TValue;
};

/**
 * A code-first subgraph, as the loader sees it: a constructible class carrying
 * a compiled subgraph definition. Spelled structurally rather than imported
 * from `reactor-api`, which would make this package depend on a host.
 */
export type SubgraphClass = abstract new (...args: never[]) => unknown;

export type LoadedDefinitionSet = DefinitionSourceResolution & {
  readonly documentModels: readonly LoadedDefinition<DocumentModelModule>[];
  readonly upgradeManifests: readonly LoadedDefinition<
    UpgradeManifest<readonly number[]>
  >[];
  readonly subgraphs: readonly LoadedDefinition<SubgraphClass>[];
  /**
   * Scalars a selected source exported. A factory `defineScalar` returned for
   * a name outside the catalog is a package scalar; anything else is a
   * failure the check reports by name, which is what keeps it from passing as
   * an unrecognised export.
   */
  readonly scalars: readonly LoadedDefinition<LoadedScalar>[];
};

/** An exported scalar, and the binding it carries when `defineScalar` made it. */
export type LoadedScalar = {
  readonly name: string;
  readonly binding?: ScalarBinding;
};
