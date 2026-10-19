import type {
  DefinitionCheckReport,
  DefinitionCheckSkipReason,
  DefinitionDiagnostic,
  DefinitionPath,
  DefinitionSource,
  DocumentModelModule,
  LocationFreeGraphQLDocumentNode,
  ScalarDefinition,
  Sha256Digest,
  SubgraphDefinition,
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
  /**
   * A missing config file then selects nothing, as a config without
   * `definitionSources` does, so the package's subgraphs are still checked.
   */
  readonly allowMissingConfig?: boolean;
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
  /** The directory of the selected config file. */
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

/** One value the traversal recognised, with where it was found. */
export type LoadedDefinition<TValue> = {
  /** Specifier plus the complete export path down to this value. */
  readonly source: DefinitionSource;
  /** The path inside the selected export, for diagnostics. */
  readonly path: DefinitionPath;
  readonly value: TValue;
};

export type SubgraphClass = abstract new (...args: never[]) => unknown;

/** What a subgraph class's protocol `describe()` returns: plain data. */
export type SubgraphProtocolDescription = {
  readonly subgraphName: string;
  readonly definition: SubgraphDefinition;
  readonly typeDefs: LocationFreeGraphQLDocumentNode;
  readonly hasSubscriptions: boolean;
  /** Sourced to the export the class was read from. */
  readonly diagnostics: readonly DefinitionDiagnostic[];
  readonly scalarDefinitions: readonly ScalarDefinition[];
};

export type DescribedSubgraph = LoadedDefinition<SubgraphClass> & {
  readonly description: SubgraphProtocolDescription;
};

/**
 * Every class that described, and a diagnostic for each import failure,
 * old-style or nameless class, or class `describe()` refused.
 */
export type LoadedSubgraphSet = {
  readonly sharedBases: readonly LoadedDefinition<SubgraphClass>[];
  readonly subgraphs: readonly DescribedSubgraph[];
  readonly diagnostics: readonly DefinitionDiagnostic[];
};

export type LoadedDefinitionSet = DefinitionSourceResolution & {
  readonly documentModels: readonly LoadedDefinition<DocumentModelModule>[];
  readonly upgradeManifests: readonly LoadedDefinition<
    UpgradeManifest<readonly number[]>
  >[];
  /**
   * The subgraph classes of the package's `subgraphs/index.ts` and
   * `subgraphs/<name>/index.ts` entries, found whatever `definitionSources` says.
   */
  readonly subgraphs: readonly DescribedSubgraph[];
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
