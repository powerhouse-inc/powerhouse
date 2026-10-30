import type {
  Action,
  Actions,
  baseActions,
  PHBaseState,
  SignalDispatch,
} from "@powerhousedao/shared/document-model";
import type {
  DefinitionExampleDeclaration,
  OperationErrorDeclaration,
  StateRootDescriptor,
} from "../compiler/compile.js";
import type { DocumentModelActionType } from "../compiler/naming.js";
import type {
  AnyTypeDescriptor,
  InputDescriptor,
  InputOf,
  SourceOf,
} from "../dsl/types.js";

type Mutable<T> = T extends readonly (infer TItem)[]
  ? Mutable<TItem>[]
  : T extends object
    ? { -readonly [K in keyof T]: Mutable<T[K]> }
    : T;

type StateScopeDeclaration<TSchema extends StateRootDescriptor> = {
  readonly schema: TSchema;
  readonly initialValue: SourceOf<TSchema>;
  readonly examples?: readonly DefinitionExampleDeclaration[];
};

type EmptyLocalScopeDeclaration = {
  readonly schema: null;
  readonly initialValue: Readonly<Record<string, never>>;
  readonly examples?: readonly DefinitionExampleDeclaration[];
};

/** @experimental */
export type DocumentModelConfig<
  TGlobal extends StateRootDescriptor,
  TLocal extends StateRootDescriptor | null,
  TVersion extends number,
> = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly extension: string;
  readonly version: TVersion;
  readonly author: {
    readonly name: string;
    readonly website?: string | null;
  };
  readonly changeLog?: readonly string[];
  readonly specifications: {
    readonly auxiliaryTypes?: readonly AnyTypeDescriptor[];
    readonly global: StateScopeDeclaration<TGlobal>;
    readonly local: TLocal extends StateRootDescriptor
      ? StateScopeDeclaration<TLocal>
      : EmptyLocalScopeDeclaration;
  };
};

type LocalStateOfDescriptor<TLocal extends StateRootDescriptor | null> =
  TLocal extends StateRootDescriptor
    ? Mutable<SourceOf<TLocal>>
    : Record<string, never>;

/** @experimental The document state a model's descriptors describe. */
export type ModelState<
  TGlobal extends StateRootDescriptor,
  TLocal extends StateRootDescriptor | null,
> = PHBaseState & {
  global: Mutable<SourceOf<TGlobal>>;
  local: LocalStateOfDescriptor<TLocal>;
};

type ErrorDeclarations = Readonly<Record<string, OperationErrorDeclaration>>;

type ErrorCodeOf<TKey extends string, TError> = TError extends {
  readonly code: infer TCode extends string;
}
  ? TCode extends ""
    ? TError extends { readonly name: string }
      ? string
      : TKey
    : TCode
  : TKey;

type OperationErrorClasses<TErrors extends ErrorDeclarations> = {
  readonly [K in keyof TErrors & string]: new (
    message?: string,
  ) => Error & { readonly errorCode: ErrorCodeOf<K, TErrors[K]> };
};

type ModelOperationContext<
  TInput extends InputDescriptor,
  TErrors extends ErrorDeclarations,
> = {
  readonly errors: OperationErrorClasses<TErrors>;
  readonly action: Action & { readonly input: InputOf<TInput> };
  readonly dispatch: SignalDispatch | undefined;
};

type ModelOperationConfig<
  TState,
  TInput extends InputDescriptor,
  TErrors extends ErrorDeclarations,
> = {
  readonly description?: string;
  readonly input: TInput;
  readonly errors?: TErrors;
  readonly examples?: readonly DefinitionExampleDeclaration[];
  readonly template?: string | null;
  readonly reducerTemplate?: string | null;
  readonly reduce: (
    state: Mutable<TState>,
    input: Mutable<InputOf<TInput>>,
    context: ModelOperationContext<TInput, TErrors>,
  ) => void;
};

// Tokens are opaque: carrying the configuration and callback types in every
// token would repeat them in each consumer's emitted declarations.
declare const operationTokenBrand: unique symbol;

/** @experimental An operation declared by a scope builder. */
export interface ModelOperationToken<
  TInput extends InputDescriptor = InputDescriptor,
  TScope extends "global" | "local" = "global" | "local",
> {
  readonly kind: "powerhouse.document-model-operation";
  readonly [operationTokenBrand]?: {
    readonly input: TInput;
    readonly scope: TScope;
  };
}

export interface ModelOperationBuilder<
  TState,
  TScope extends "global" | "local",
> {
  <
    const TInput extends InputDescriptor,
    const TErrors extends ErrorDeclarations = Record<never, never>,
  >(
    config: ModelOperationConfig<TState, TInput, TErrors>,
  ): ModelOperationToken<TInput, TScope>;
}

type InputOfOperation<T> =
  T extends ModelOperationToken<infer TInput, any> ? InputOf<TInput> : never;
type ScopeOfOperation<T> =
  T extends ModelOperationToken<any, infer TScope> ? TScope : never;

type ActionForOperation<T, TType extends string = string> = Action & {
  readonly type: TType;
  readonly input: InputOfOperation<T>;
  readonly scope: ScopeOfOperation<T>;
};

type CreatorParameters<T> = keyof InputOfOperation<T> extends never
  ? [input?: InputOfOperation<T>]
  : [input: InputOfOperation<T>];

/** @experimental */
export type ActionsForOperationTokens<
  TOperations extends Readonly<Record<string, ModelOperationToken>>,
> = {
  readonly [K in keyof TOperations]: (
    ...args: CreatorParameters<TOperations[K]>
  ) => ActionForOperation<TOperations[K], DocumentModelActionType<K & string>>;
};

declare const moduleTokenBrand: unique symbol;

/** @experimental A module declared by `context.module`. */
export interface ModelModuleToken<
  TState extends PHBaseState = PHBaseState,
  TActions extends Actions = Actions,
  TKey extends string = string,
> {
  readonly kind: "powerhouse.document-model-module";
  readonly [moduleTokenBrand]?: {
    readonly state: TState;
    readonly actions: TActions;
    readonly key: TKey;
  };
}

type UnionToIntersection<T> = (
  T extends unknown ? (value: T) => void : never
) extends (value: infer TIntersection) => void
  ? TIntersection
  : never;

type ModelActionsOf<TModules extends readonly ModelModuleToken[]> =
  UnionToIntersection<
    TModules[number] extends ModelModuleToken<any, infer TActions, any>
      ? TActions
      : never
  >;

type ActionsOfModules<
  TModules extends readonly ModelModuleToken[],
  TModelActions = ModelActionsOf<TModules>,
> = TModelActions & Omit<typeof baseActions, keyof TModelActions>;

declare const versionTokenBrand: unique symbol;

/**
 * @experimental A compiled model version. `materialize` turns it into a
 * document model module; `defineDocumentModelFamily` composes several.
 */
export interface DocumentModelVersionDefinition<
  TVersion extends number = number,
  TState extends PHBaseState = PHBaseState,
  TActions extends Actions = Actions,
> {
  readonly kind: "powerhouse.document-model-version";
  readonly version: TVersion;
  readonly documentType: string;
  readonly [versionTokenBrand]?: {
    readonly state: TState;
    readonly actions: TActions;
  };
}

type DocumentModelVersionConfig<TModules extends readonly ModelModuleToken[]> =
  {
    readonly modules: TModules;
  };

/** @experimental The context `defineDocumentModel` returns. */
export interface DocumentModelContext<
  TGlobal extends StateRootDescriptor,
  TLocal extends StateRootDescriptor | null,
  TVersion extends number,
> {
  module<
    const TKey extends string,
    const TOperations extends Readonly<Record<string, ModelOperationToken>>,
  >(
    key: TKey,
    config: {
      readonly description?: string;
      readonly operations: (builders: {
        readonly global: ModelOperationBuilder<
          Mutable<SourceOf<TGlobal>>,
          "global"
        >;
        readonly local: ModelOperationBuilder<
          LocalStateOfDescriptor<TLocal>,
          "local"
        >;
      }) => TOperations;
    },
  ): ModelModuleToken<
    ModelState<TGlobal, TLocal>,
    ActionsForOperationTokens<TOperations>,
    TKey
  >;

  version<
    const TModules extends readonly ModelModuleToken<
      ModelState<TGlobal, TLocal>,
      Actions
    >[],
  >(
    config: DocumentModelVersionConfig<TModules>,
  ): DocumentModelVersionDefinition<
    TVersion,
    ModelState<TGlobal, TLocal>,
    ActionsOfModules<TModules>
  >;
}

declare const familyTokenBrand: unique symbol;

/**
 * @experimental The checked versions of one document type and their upgrade
 * manifest. `materialize` turns it into one module per version.
 */
export interface DocumentModelFamilyDefinition<
  TVersions extends readonly DocumentModelVersionDefinition[] =
    readonly DocumentModelVersionDefinition[],
> {
  readonly kind: "powerhouse.document-model-family";
  readonly documentType: string;
  readonly [familyTokenBrand]?: {
    readonly versions: TVersions;
  };
}
