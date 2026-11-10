import type {
  DefinitionDiagnostic,
  SubgraphDefinition,
} from "@powerhousedao/shared/document-model";
import type {
  AnyFieldDescriptor,
  AnyTypeDescriptor,
  InputDescriptor,
  InterfaceDescriptor,
  ObjectDescriptor,
  ObjectFields,
  OutputOf,
  SourceOf,
  UnionDescriptor,
} from "../dsl/types.js";

type MaybePromise<T> = T | Promise<T>;

type NoArgs = Readonly<Record<never, AnyFieldDescriptor>>;

/**
 * @experimental What a resolver receives. `subgraph` is the instance the
 * host serves, so a resolver reaches its services and helpers through it.
 */
export type SubgraphResolverCall<TParent, TArgs, TSubgraph, TRequest, TInfo> = {
  readonly parent: TParent;
  readonly args: TArgs;
  readonly request: TRequest;
  readonly info: TInfo;
  readonly subgraph: TSubgraph;
};

/** @experimental What a `resolveType` function receives. */
export type SubgraphResolveTypeCall<TValue, TSubgraph, TRequest, TInfo> = {
  readonly value: TValue;
  readonly request: TRequest;
  readonly info: TInfo;
  readonly subgraph: TSubgraph;
};

/**
 * @experimental The arguments a resolver receives: the resolved input form,
 * with defaults applied, as a reducer receives an operation input.
 */
export type SubgraphArgsOf<TArgs extends ObjectFields> = SourceOf<
  InputDescriptor<TArgs>
>;

type FieldSpec<TArgs extends ObjectFields, TType extends AnyFieldDescriptor> = {
  readonly args?: TArgs;
  readonly type: TType;
  readonly description?: string;
  readonly deprecated?: string;
};

type Resolver<
  TParent,
  TArgs extends ObjectFields,
  TResult,
  TSubgraph,
  TRequest,
  TInfo,
> = (
  call: SubgraphResolverCall<
    TParent,
    SubgraphArgsOf<TArgs>,
    TSubgraph,
    TRequest,
    TInfo
  >,
) => MaybePromise<TResult>;

/**
 * @experimental An entry of a code-first subgraph: a root field, a computed
 * field, an abstract type's `resolveType`, or a type no field reaches. Only
 * the entry builders create one, and it is frozen.
 */
export type SubgraphEntry<
  TSubgraph = unknown,
  TRequest = unknown,
  TInfo = unknown,
> = {
  readonly kind:
    | "query"
    | "mutation"
    | "subscription"
    | "computed-field"
    | "resolve-type"
    | "type";
  /** Type-only; it makes an entry accept a narrower subgraph, request and info. */
  readonly __types?: (
    subgraph: TSubgraph,
    request: TRequest,
    info: TInfo,
  ) => void;
};

/**
 * @experimental The entry builders, bound to a subgraph, request and info
 * type. A missing `resolve`, `subscribe` or `resolveType` is reported by
 * `compileSubgraph`, not thrown here.
 */
export type SubgraphEntryBuilders<TSubgraph, TRequest, TInfo> = {
  query<TType extends AnyFieldDescriptor, TArgs extends ObjectFields = NoArgs>(
    name: string,
    spec: FieldSpec<TArgs, TType> & {
      readonly resolve: Resolver<
        undefined,
        TArgs,
        OutputOf<TType>,
        TSubgraph,
        TRequest,
        TInfo
      >;
    },
  ): SubgraphEntry<TSubgraph, TRequest, TInfo>;

  mutation<
    TType extends AnyFieldDescriptor,
    TArgs extends ObjectFields = NoArgs,
  >(
    name: string,
    spec: FieldSpec<TArgs, TType> & {
      readonly resolve: Resolver<
        undefined,
        TArgs,
        OutputOf<TType>,
        TSubgraph,
        TRequest,
        TInfo
      >;
    },
  ): SubgraphEntry<TSubgraph, TRequest, TInfo>;

  /** With `resolve`, each event is mapped to the field's value. */
  subscription<
    TType extends AnyFieldDescriptor,
    TEvent,
    TArgs extends ObjectFields = NoArgs,
  >(
    name: string,
    spec: FieldSpec<TArgs, TType> & {
      readonly subscribe: Resolver<
        undefined,
        TArgs,
        AsyncIterable<TEvent>,
        TSubgraph,
        TRequest,
        TInfo
      >;
      readonly resolve: Resolver<
        TEvent,
        TArgs,
        OutputOf<TType>,
        TSubgraph,
        TRequest,
        TInfo
      >;
    },
  ): SubgraphEntry<TSubgraph, TRequest, TInfo>;
  /** Without `resolve`, each event carries the field's value under its name. */
  subscription<
    TName extends string,
    TType extends AnyFieldDescriptor,
    TArgs extends ObjectFields = NoArgs,
  >(
    name: TName,
    spec: FieldSpec<TArgs, TType> & {
      readonly subscribe: Resolver<
        undefined,
        TArgs,
        AsyncIterable<{ readonly [K in TName]: OutputOf<TType> }>,
        TSubgraph,
        TRequest,
        TInfo
      >;
    },
  ): SubgraphEntry<TSubgraph, TRequest, TInfo>;

  /** A field that `resolve` computes, added to an object type. */
  field<
    TParent extends ObjectDescriptor,
    TType extends AnyFieldDescriptor,
    TArgs extends ObjectFields = NoArgs,
  >(
    parent: TParent,
    name: string,
    spec: FieldSpec<TArgs, TType> & {
      readonly resolve: Resolver<
        OutputOf<TParent>,
        TArgs,
        OutputOf<TType>,
        TSubgraph,
        TRequest,
        TInfo
      >;
    },
  ): SubgraphEntry<TSubgraph, TRequest, TInfo>;

  /** Names the object type of a value of an interface or union. */
  resolveType<TAbstract extends InterfaceDescriptor | UnionDescriptor>(
    type: TAbstract,
    resolveType: (
      call: SubgraphResolveTypeCall<
        OutputOf<TAbstract>,
        TSubgraph,
        TRequest,
        TInfo
      >,
    ) => MaybePromise<string | undefined>,
  ): SubgraphEntry<TSubgraph, TRequest, TInfo>;

  /**
   * Serves a named type, and every type it reaches, that no field reaches:
   * typically an object type that only an interface leads to. It binds no
   * resolver.
   */
  type(type: AnyTypeDescriptor): SubgraphEntry<TSubgraph, TRequest, TInfo>;
};

type BoundResolver<TSubgraph, TRequest, TInfo> = (
  call: SubgraphResolverCall<unknown, unknown, TSubgraph, TRequest, TInfo>,
) => unknown;

/**
 * @experimental The functions bound to one schema coordinate. A host builds
 * its resolver map from these without calling `getSchema` again.
 */
export type SubgraphBinding<TSubgraph, TRequest, TInfo> =
  | {
      readonly kind: "query" | "mutation" | "computed-field";
      readonly typeName: string;
      readonly fieldName: string;
      readonly resolve: BoundResolver<TSubgraph, TRequest, TInfo>;
    }
  | {
      readonly kind: "subscription";
      readonly typeName: "Subscription";
      readonly fieldName: string;
      readonly subscribe: BoundResolver<TSubgraph, TRequest, TInfo>;
      readonly resolve?: BoundResolver<TSubgraph, TRequest, TInfo>;
    }
  | {
      readonly kind: "resolve-type";
      readonly typeName: string;
      readonly fieldName: null;
      readonly resolveType: (
        call: SubgraphResolveTypeCall<unknown, TSubgraph, TRequest, TInfo>,
      ) => unknown;
    };

/**
 * @experimental The result of `compileSubgraph`. `definition` is present
 * exactly when `diagnostics` holds no error; `bindings` is then keyed by
 * coordinate (`Type.field`, or the type name for `resolveType`) and is empty
 * otherwise.
 */
export type SubgraphCompilation<TSubgraph, TRequest, TInfo> = {
  readonly definition?: SubgraphDefinition & { readonly schemaKind: "typed" };
  readonly bindings: ReadonlyMap<
    string,
    SubgraphBinding<TSubgraph, TRequest, TInfo>
  >;
  readonly diagnostics: readonly DefinitionDiagnostic[];
};
