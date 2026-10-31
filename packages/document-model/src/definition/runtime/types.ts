import type {
  Actions,
  DocumentModelDefinition,
  DocumentModelModule,
  PHBaseState,
  PHDocument,
  UpgradeManifest,
} from "@powerhousedao/shared/document-model";
import type { DocumentModelVersionDefinition } from "../model/types.js";

/**
 * @experimental An ordinary `DocumentModelModule` with typed actions and the
 * stored definition it was compiled to. Hosts use `reducer`, `actions`,
 * `utils`, and `documentModel` as they use a generated module's.
 */
export type CodeFirstDocumentModelModule<
  TState extends PHBaseState = PHBaseState,
  TActions extends Actions = Actions,
> = Omit<DocumentModelModule<TState>, "actions" | "version"> & {
  readonly version: number;
  readonly actions: TActions;
  readonly definition: DocumentModelDefinition;
};

type ModuleOfVersion<T> =
  T extends DocumentModelVersionDefinition<any, infer TState, infer TActions>
    ? CodeFirstDocumentModelModule<TState, TActions>
    : never;

type VersionNumbered<TMember, TVersion extends number> =
  TMember extends DocumentModelVersionDefinition<infer TNumber, any, any>
    ? TVersion extends TNumber
      ? TMember
      : never
    : never;

/** @experimental One module per version, and the family's upgrade manifest. */
export type DocumentModelFamily<
  TVersions extends readonly DocumentModelVersionDefinition[] =
    readonly DocumentModelVersionDefinition[],
> = {
  readonly modules: {
    readonly [K in keyof TVersions]: ModuleOfVersion<TVersions[K]>;
  };
  readonly upgradeManifest: UpgradeManifest<readonly number[]>;
  at<const TVersion extends TVersions[number]["version"]>(
    version: TVersion,
  ): ModuleOfVersion<VersionNumbered<TVersions[number], TVersion>>;
};

/** @experimental The global state of a materialized module. */
export type GlobalStateOf<T> =
  T extends CodeFirstDocumentModelModule<infer TState, any>
    ? TState extends { global: infer TGlobal }
      ? TGlobal
      : never
    : never;

/** @experimental The local state of a materialized module. */
export type LocalStateOf<T> =
  T extends CodeFirstDocumentModelModule<infer TState, any>
    ? TState extends { local: infer TLocal }
      ? TLocal
      : never
    : never;

/** @experimental The document type of a materialized module. */
export type DocumentOf<T> =
  T extends CodeFirstDocumentModelModule<infer TState, any>
    ? PHDocument<TState>
    : never;

/** @experimental Any action a materialized module's creators return. */
export type ActionOf<T> =
  T extends CodeFirstDocumentModelModule<any, infer TActions>
    ? ReturnType<TActions[keyof TActions]>
    : never;
