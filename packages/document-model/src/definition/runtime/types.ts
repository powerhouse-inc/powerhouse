import type {
  Actions,
  DocumentModelDefinition,
  DocumentModelModule,
  PHBaseState,
  PHDocument,
  UpgradeManifest,
} from "@powerhousedao/shared/document-model";
import type { DocumentModelVersionDefinition } from "../model/types.js";
import type { AuthBindings, InitialAuthRuntime } from "../auth/types.js";

/**
 * @experimental An ordinary `DocumentModelModule` with typed actions and the
 * stored definition it was compiled to. Hosts use `reducer`, `actions`,
 * `utils`, and `documentModel` as they use a generated module's.
 */
export type CodeFirstDocumentModelModule<
  TState extends PHBaseState = PHBaseState,
  TActions extends Actions = Actions,
  TBindings extends AuthBindings | undefined = AuthBindings | undefined,
> = Omit<DocumentModelModule<TState>, "actions" | "version" | "initialAuth"> & {
  readonly version: number;
  readonly actions: TActions;
  readonly definition: DocumentModelDefinition;
} & (TBindings extends AuthBindings
    ? { readonly initialAuth: InitialAuthRuntime<TBindings> }
    : { readonly initialAuth?: never });

type ModuleOfVersion<T> =
  T extends DocumentModelVersionDefinition<
    any,
    infer TState,
    infer TActions,
    infer TBindings
  >
    ? CodeFirstDocumentModelModule<TState, TActions, TBindings>
    : never;

type VersionNumbered<TMember, TVersion extends number> =
  TMember extends DocumentModelVersionDefinition<infer TNumber, any, any, any>
    ? TVersion extends TNumber
      ? TMember
      : never
    : never;

/** @experimental One module per version, and the family's upgrade manifest. */
export type DocumentModelFamily<
  TVersions extends readonly DocumentModelVersionDefinition<
    number,
    PHBaseState,
    Actions,
    AuthBindings | undefined
  >[] = readonly DocumentModelVersionDefinition<
    number,
    PHBaseState,
    Actions,
    AuthBindings | undefined
  >[],
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
  T extends CodeFirstDocumentModelModule<infer TState, any, any>
    ? TState extends { global: infer TGlobal }
      ? TGlobal
      : never
    : never;

/** @experimental The local state of a materialized module. */
export type LocalStateOf<T> =
  T extends CodeFirstDocumentModelModule<infer TState, any, any>
    ? TState extends { local: infer TLocal }
      ? TLocal
      : never
    : never;

/** @experimental The document type of a materialized module. */
export type DocumentOf<T> =
  T extends CodeFirstDocumentModelModule<infer TState, any, any>
    ? PHDocument<TState>
    : never;

/** @experimental Any action a materialized module's creators return. */
export type ActionOf<T> =
  T extends CodeFirstDocumentModelModule<any, infer TActions, any>
    ? ReturnType<TActions[keyof TActions]>
    : never;
