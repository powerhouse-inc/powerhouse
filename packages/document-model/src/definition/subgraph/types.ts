import type {
  LocationFreeGraphQLDocumentNodeV1,
  SubgraphDefinitionV1,
} from "@powerhousedao/shared/document-model";
import type {
  AnyFieldDescriptor,
  AnyTypeDescriptor,
  ComputedFieldToken,
  InputObjectOf,
  InterfaceDescriptor,
  ObjectDescriptor,
  ObjectFields,
  OutputOf,
  SourceOf,
  UnionDescriptor,
} from "../types.js";

export type MaybePromise<T> = T | Promise<T>;

export type SubgraphBaseInstance<TDocument = unknown> = {
  name: string;
  path?: string;
  typeDefs: TDocument;
  resolvers: Record<string, unknown>;
  hasSubscriptions?: boolean;
  onSetup?(): Promise<void>;
};

export type SubgraphBaseConstructor<
  TArgs,
  TDocument = unknown,
  TInstance extends SubgraphBaseInstance<TDocument> =
    SubgraphBaseInstance<TDocument>,
> = new (args: TArgs) => TInstance;

export type ResolverCall<TParent, TArgs, TSubgraph, TRequest, TInfo> = {
  readonly parent: TParent;
  readonly args: TArgs;
  readonly subgraph: TSubgraph;
  readonly request: TRequest;
  readonly info: TInfo;
};

export type ResolveTypeCall<TValue, TSubgraph, TRequest, TInfo, TAbstractType> =
  {
    readonly value: TValue;
    readonly subgraph: TSubgraph;
    readonly request: TRequest;
    readonly info: TInfo;
    readonly abstractType: TAbstractType;
  };

export type IsTypeOfCall<TValue, TSubgraph, TRequest, TInfo> = {
  readonly value: TValue;
  readonly subgraph: TSubgraph;
  readonly request: TRequest;
  readonly info: TInfo;
};

type RootEntryOptions<
  TArgs extends ObjectFields,
  TReturns extends AnyFieldDescriptor,
  TSubgraph,
  TRequest,
  TInfo,
> = {
  readonly args?: TArgs;
  readonly returns: TReturns;
  readonly description?: string;
  readonly fieldName?: string;
  readonly compatibilityName?: string;
  readonly resolve: (
    call: ResolverCall<
      unknown,
      InputObjectOf<TArgs>,
      TSubgraph,
      TRequest,
      TInfo
    >,
  ) => MaybePromise<SourceOf<TReturns>>;
};

type SubscriptionEntryOptions<
  TArgs extends ObjectFields,
  TReturns extends AnyFieldDescriptor,
  TSubgraph,
  TRequest,
  TInfo,
> = Omit<
  RootEntryOptions<TArgs, TReturns, TSubgraph, TRequest, TInfo>,
  "resolve"
> & {
  readonly subscribe: (
    call: ResolverCall<
      unknown,
      InputObjectOf<TArgs>,
      TSubgraph,
      TRequest,
      TInfo
    >,
  ) => MaybePromise<AsyncIterable<SourceOf<TReturns>>>;
  readonly resolve?: (
    call: ResolverCall<
      SourceOf<TReturns>,
      InputObjectOf<TArgs>,
      TSubgraph,
      TRequest,
      TInfo
    >,
  ) => MaybePromise<SourceOf<TReturns>>;
};

export type TypedSubgraphEntry = {
  readonly __powerhouseSubgraphEntry: true;
  readonly entryKind:
    | "query"
    | "mutation"
    | "subscription"
    | "field"
    | "resolveType"
    | "isTypeOf"
    | "type";
};

export type EntryBuilders<
  TSubgraph,
  TRequest,
  TInfo = unknown,
  TAbstractType = unknown,
> = {
  query<
    const TArgs extends ObjectFields = Record<never, never>,
    const TReturns extends AnyFieldDescriptor = AnyFieldDescriptor,
  >(
    key: string,
    options: RootEntryOptions<TArgs, TReturns, TSubgraph, TRequest, TInfo>,
  ): TypedSubgraphEntry;
  mutation<
    const TArgs extends ObjectFields = Record<never, never>,
    const TReturns extends AnyFieldDescriptor = AnyFieldDescriptor,
  >(
    key: string,
    options: RootEntryOptions<TArgs, TReturns, TSubgraph, TRequest, TInfo>,
  ): TypedSubgraphEntry;
  subscription<
    const TArgs extends ObjectFields = Record<never, never>,
    const TReturns extends AnyFieldDescriptor = AnyFieldDescriptor,
  >(
    key: string,
    options: SubscriptionEntryOptions<
      TArgs,
      TReturns,
      TSubgraph,
      TRequest,
      TInfo
    >,
  ): TypedSubgraphEntry;
  field<
    TParent,
    const TArgs extends ObjectFields,
    const TReturns extends AnyFieldDescriptor,
  >(
    target: ComputedFieldToken<TParent, TArgs, TReturns>,
    options: {
      readonly resolve: (
        call: ResolverCall<
          TParent,
          InputObjectOf<TArgs>,
          TSubgraph,
          TRequest,
          TInfo
        >,
      ) => MaybePromise<SourceOf<TReturns>>;
    },
  ): TypedSubgraphEntry;
  resolveType<TType extends InterfaceDescriptor | UnionDescriptor>(
    type: TType,
    resolve: (
      call: ResolveTypeCall<
        OutputOf<TType>,
        TSubgraph,
        TRequest,
        TInfo,
        TAbstractType
      >,
    ) => MaybePromise<ObjectDescriptor | string | undefined>,
  ): TypedSubgraphEntry;
  isTypeOf<TType extends ObjectDescriptor>(
    type: TType,
    resolve: (
      call: IsTypeOfCall<OutputOf<TType>, TSubgraph, TRequest, TInfo>,
    ) => MaybePromise<boolean>,
  ): TypedSubgraphEntry;
  type(type: AnyTypeDescriptor): TypedSubgraphEntry;
};

export type GraphQLAstCompatibility<TSubgraph, TDocument> = {
  readonly kind: "graphql-ast-v1";
  readonly typeDefs: TDocument;
  readonly getResolvers: (call: {
    readonly subgraph: TSubgraph;
  }) => Record<string, unknown>;
  readonly hasSubscriptions: boolean | undefined;
  readonly preserveDefinitionOrder: true;
};

type SubgraphConfigBase<TSubgraph> = {
  readonly name: string;
  readonly onSetup?: (call: {
    readonly subgraph: TSubgraph;
  }) => void | Promise<void>;
};

export type SubgraphConfig<
  TRequest,
  TSubgraph,
  TDocument,
  TInfo = unknown,
  TAbstractType = unknown,
> = SubgraphConfigBase<TSubgraph> &
  (
    | {
        readonly schemaKind: "typed";
        readonly entries: (
          builders: EntryBuilders<TSubgraph, TRequest, TInfo, TAbstractType>,
        ) => readonly TypedSubgraphEntry[];
      }
    | {
        readonly schemaKind: "graphql-ast-compat";
        readonly compatibility: GraphQLAstCompatibility<TSubgraph, TDocument>;
      }
  );

export type DefinedSubgraphConstructor<
  TArgs,
  TInstance,
  TBase extends new (args: TArgs) => TInstance,
> = TBase & {
  readonly definition: SubgraphDefinitionV1;
  new (args: TArgs): TInstance & {
    name: string;
    typeDefs: LocationFreeGraphQLDocumentNodeV1;
    resolvers: Record<string, unknown>;
    hasSubscriptions?: boolean;
  };
};
