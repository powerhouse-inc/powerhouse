import type {
  AnyFieldDescriptor,
  ComputedSourceBrand,
  OutputMembers,
  AnyTypeDescriptor,
  FieldDescriptor,
  InputOf,
  ObjectDescriptor,
  ObjectFields,
  OutputOf,
  SourceOf,
} from "../types.js";

/**
 * The typed subgraph declaration surface.
 *
 * Two ideas carry most of it. A **computed field** is declared on an object
 * but supplied by a resolver, so it appears in the completed GraphQL result
 * and never in what a resolver hands back. An **entry** binds an
 * implementation to a coordinate in the schema and is the only place a closure
 * lives — the definition itself is data.
 */

/** What a resolver may return when it does not have to return synchronously. */
export type MaybePromise<T> = T | Promise<T>;

/**
 * The brand that keeps a computed field out of a backing source.
 *
 * A unique symbol rather than `never`: `never` would make the whole mapped
 * type collapse, and an ordinary marker object would be assignable from a
 * plausible value and so would silently accept a source that supplied the
 * field by hand.
 */
export type ComputedFieldSource = {
  readonly [K in ComputedSourceBrand]: true;
};

export const COMPUTED_FIELD_ROLE =
  "computed field; bind it with field(Type.computed.name, { resolve })" as const;

/**
 * A field whose value a resolver computes.
 *
 * It carries schema only — arguments, return type, description, deprecation.
 * The implementation is bound separately, inside the entries callback, where
 * the host instance and the request type are in scope.
 */
export type ComputedFieldDescriptor<
  TArgs extends ObjectFields = ObjectFields,
  TReturns extends AnyFieldDescriptor = AnyFieldDescriptor,
> = {
  readonly role: typeof COMPUTED_FIELD_ROLE;
  readonly kind: "computed-field";
  readonly args: TArgs;
  readonly returns: TReturns;
  readonly description: string | null;
  readonly deprecated: string | null;
  readonly __types?: {
    readonly input: never;
    readonly output: OutputOf<TReturns>;
    readonly source: ComputedFieldSource;
  };
};

export type AnyComputedFieldDescriptor = ComputedFieldDescriptor<any, any>;

/** A member of an output object: an ordinary field use, or a computed field. */
export type OutputMember = AnyFieldDescriptor | AnyComputedFieldDescriptor;

export type { OutputMembers };

/** The completed GraphQL result: every member, computed ones included. */
export type OutputObjectWithComputed<TMembers extends OutputMembers> = {
  -readonly [K in keyof TMembers]: OutputOf<TMembers[K]>;
};

/**
 * What a resolver supplies: every member a source really carries.
 *
 * Computed members are dropped, recursively — a nested object's computed
 * fields are GraphQL's job to complete, so a resolver returning that object
 * must not be asked for them either.
 */
export type SourceObjectWithComputed<TMembers extends OutputMembers> = {
  -readonly [K in keyof TMembers as SourceOf<
    TMembers[K]
  > extends ComputedFieldSource
    ? never
    : K]: SourceOf<TMembers[K]>;
};

/**
 * The stable token a computed field is bound through.
 *
 * `Object.computed.<field>` rather than a string: a rename is then a compile
 * error at the binding rather than a missing-binding diagnostic at build time.
 */
export type ComputedToken<
  TParent = unknown,
  TArgs = unknown,
  TReturns = unknown,
> = {
  readonly kind: "computed-token";
  readonly typeName: string;
  readonly fieldName: string;
  readonly __types?: {
    readonly parent: TParent;
    readonly args: TArgs;
    readonly returns: TReturns;
  };
};

export type AnyComputedToken = ComputedToken<any, any, any>;

/**
 * Everything a resolver is handed.
 *
 * The four GraphQL execution objects, unchanged, plus the bound instance. The
 * instance is what the current `getResolvers(this)` factories capture, so an
 * author reaches host dependencies the same way they always did — through the
 * subgraph — rather than by declaring them again.
 */
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

/** A registered entry. Immutable, and produced only by the builders. */
declare const ENTRY_BRAND: unique symbol;

export type TypedSubgraphEntry = {
  readonly [ENTRY_BRAND]: true;
  readonly kind:
    | "query"
    | "mutation"
    | "subscription"
    | "computed-field"
    | "resolve-type"
    | "is-type-of";
};

/** The arguments of a root entry, as the author writes them. */
export type RootEntryOptions<
  TArgs extends ObjectFields,
  TReturns extends AnyFieldDescriptor,
> = {
  /** Overrides the GraphQL field name; the key stays the author's. */
  readonly fieldName?: string;
  readonly description?: string;
  readonly deprecated?: string;
  readonly args?: TArgs;
  readonly returns: TReturns;
};

export type ArgsObject<TArgs extends ObjectFields> = {
  -readonly [K in keyof TArgs]: InputOf<TArgs[K]>;
};

export type ObjectWithComputed = ObjectDescriptor & {
  readonly computed: Readonly<Record<string, AnyComputedToken>>;
};

export type AnyNamedDescriptor = AnyTypeDescriptor;

export type FieldUse<T> = FieldDescriptor<T, T, T, boolean>;
