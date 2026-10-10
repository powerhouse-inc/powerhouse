import { failDefinition } from "../diagnostics.js";
import { snapshotDescriptorOptions } from "../field-options.js";
import type { AnyFieldDescriptor, ObjectFields } from "../types.js";
import {
  COMPUTED_FIELD_ROLE,
  type AnyComputedFieldDescriptor,
  type AnyComputedToken,
  type ArgsObject,
  type ComputedFieldDescriptor,
  type ComputedToken,
  type MaybePromise,
  type OutputMembers,
  type ResolveTypeCall,
  type ResolverCall,
  type RootEntryOptions,
  type SourceObjectWithComputed,
  type TypedSubgraphEntry,
} from "./types.js";

/**
 * The builders an author declares a typed subgraph with.
 *
 * Every builder returns a registered entry, and the entries callback returns
 * the array of them. Nothing is discovered: a resolver that is never returned
 * is never bound, and the compiler says so rather than silently serving a
 * field that nobody implemented.
 */

/** The internal shape behind the opaque `TypedSubgraphEntry`. */
export type RegisteredEntry =
  | {
      readonly kind: "query" | "mutation" | "subscription";
      readonly key: string;
      readonly fieldName: string;
      readonly description: string | null;
      readonly deprecated: string | null;
      readonly args: ObjectFields;
      readonly returns: AnyFieldDescriptor;
      readonly resolve?: (call: never) => unknown;
      readonly subscribe?: (call: never) => unknown;
    }
  | {
      readonly kind: "computed-field";
      readonly token: AnyComputedToken;
      readonly resolve: (call: never) => unknown;
    }
  | {
      readonly kind: "resolve-type" | "is-type-of";
      readonly typeName: string;
      readonly resolve: (call: never) => unknown;
    };

const REGISTERED = new WeakSet<object>();

function register(entry: RegisteredEntry): TypedSubgraphEntry {
  const frozen = Object.freeze({ ...entry });
  REGISTERED.add(frozen);
  return frozen as unknown as TypedSubgraphEntry;
}

/**
 * Reads an entry the author returned.
 *
 * Forged entries are refused at the boundary: an object that merely looks like
 * one would let a declaration bind a resolver the builders never checked.
 */
export function readEntry(
  value: unknown,
  path: readonly (string | number)[],
): RegisteredEntry {
  if (
    value === null ||
    typeof value !== "object" ||
    !REGISTERED.has(value as object)
  ) {
    failDefinition({
      code: "PH-SG-ENTRY-INVALID",
      path,
      message: "The entries callback returned something the builders did not.",
      received: typeof value,
      repair:
        "Return only values produced by query, mutation, subscription, field, resolveType, or isTypeOf.",
    });
  }
  return value as RegisteredEntry;
}

export function isRegisteredEntry(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    REGISTERED.has(value as object)
  );
}

/**
 * Declares a computed field's schema.
 *
 * Schema only. The implementation binds separately, so an object can be
 * declared where the host type is not in scope and still gain a resolver where
 * it is.
 */
export function computedField<
  const TArgs extends ObjectFields = Record<string, never>,
  const TReturns extends AnyFieldDescriptor = AnyFieldDescriptor,
>(options: {
  readonly args?: TArgs;
  readonly returns: TReturns;
  readonly description?: string;
  readonly deprecated?: string;
}): ComputedFieldDescriptor<TArgs, TReturns> {
  const config = snapshotDescriptorOptions(
    options,
    ["args", "returns", "description", "deprecated"],
    ["options"],
  );
  if (config.returns === undefined) {
    failDefinition({
      code: "PH-SG-COMPUTED-FIELD-INVALID",
      path: ["options", "returns"],
      message: "A computed field must declare what it returns.",
      repair: "Add returns: a field use such as ph.String({ required: true }).",
    });
  }
  return Object.freeze({
    role: COMPUTED_FIELD_ROLE,
    kind: "computed-field" as const,
    args: (config.args ?? {}) as TArgs,
    returns: config.returns as TReturns,
    description:
      typeof config.description === "string" ? config.description : null,
    deprecated:
      typeof config.deprecated === "string" ? config.deprecated : null,
  }) as ComputedFieldDescriptor<TArgs, TReturns>;
}

export function isComputedField(
  value: unknown,
): value is AnyComputedFieldDescriptor {
  return (
    value !== null &&
    typeof value === "object" &&
    (value as { role?: unknown }).role === COMPUTED_FIELD_ROLE
  );
}

/** The `computed` tokens an object exposes for its computed members. */
export function computedTokens(
  typeName: string,
  members: OutputMembers,
): Readonly<Record<string, AnyComputedToken>> {
  const tokens: Record<string, AnyComputedToken> = {};
  for (const [fieldName, member] of Object.entries(members)) {
    if (!isComputedField(member)) continue;
    tokens[fieldName] = Object.freeze({
      kind: "computed-token" as const,
      typeName,
      fieldName,
    });
  }
  return Object.freeze(tokens);
}

/**
 * The builders, bound to one host's instance, request, and GraphQL types.
 *
 * Host-agnostic here and concrete in `reactor-api`: `document-model` must not
 * import the host or the GraphQL runtime, so the parameters travel and the
 * binding happens where those types exist.
 */
export type EntryBuilders<TSubgraph, TRequest, TInfo, TAbstractType> = {
  query<
    const TArgs extends ObjectFields,
    const TReturns extends AnyFieldDescriptor,
  >(
    key: string,
    options: RootEntryOptions<TArgs, TReturns> & {
      resolve(
        call: ResolverCall<
          undefined,
          ArgsObject<TArgs>,
          TSubgraph,
          TRequest,
          TInfo
        >,
      ): MaybePromise<ResolverResult<TReturns>>;
    },
  ): TypedSubgraphEntry;

  mutation<
    const TArgs extends ObjectFields,
    const TReturns extends AnyFieldDescriptor,
  >(
    key: string,
    options: RootEntryOptions<TArgs, TReturns> & {
      resolve(
        call: ResolverCall<
          undefined,
          ArgsObject<TArgs>,
          TSubgraph,
          TRequest,
          TInfo
        >,
      ): MaybePromise<ResolverResult<TReturns>>;
    },
  ): TypedSubgraphEntry;

  subscription<
    const TArgs extends ObjectFields,
    const TReturns extends AnyFieldDescriptor,
    TEvent = ResolverResult<TReturns>,
  >(
    key: string,
    options: RootEntryOptions<TArgs, TReturns> & {
      subscribe(
        call: ResolverCall<
          undefined,
          ArgsObject<TArgs>,
          TSubgraph,
          TRequest,
          TInfo
        >,
      ): MaybePromise<AsyncIterable<TEvent>>;
      /**
       * Maps an event to the declared result.
       *
       * Optional: without it GraphQL looks the field up on the event, which is
       * the default an existing subscription already relies on.
       */
      resolve?(
        call: ResolverCall<
          TEvent,
          ArgsObject<TArgs>,
          TSubgraph,
          TRequest,
          TInfo
        >,
      ): MaybePromise<ResolverResult<TReturns>>;
    },
  ): TypedSubgraphEntry;

  field<TParent, TArgs, TReturns>(
    token: ComputedToken<TParent, TArgs, TReturns>,
    options: {
      resolve(
        call: ResolverCall<TParent, TArgs, TSubgraph, TRequest, TInfo>,
      ): MaybePromise<TReturns>;
    },
  ): TypedSubgraphEntry;

  resolveType<TValue>(
    type: { readonly name: string | null },
    resolve: (
      call: ResolveTypeCall<TValue, TSubgraph, TRequest, TInfo, TAbstractType>,
    ) => MaybePromise<{ readonly name: string | null } | string | undefined>,
  ): TypedSubgraphEntry;

  isTypeOf<TValue>(
    type: { readonly name: string | null },
    resolve: (
      call: ResolverCall<TValue, undefined, TSubgraph, TRequest, TInfo>,
    ) => MaybePromise<boolean>,
  ): TypedSubgraphEntry;

  /**
   * Records named types nothing else reaches.
   *
   * Returns nothing: exposure is not an entry, and the compiler walks these
   * after the returned entries, in call order.
   */
  expose(...types: readonly { readonly name: string | null }[]): void;
};

/** What a resolver returns for a declared return type. */
export type ResolverResult<TReturns> = TReturns extends AnyFieldDescriptor
  ? SourceLike<TReturns>
  : never;

type SourceLike<TReturns extends AnyFieldDescriptor> = TReturns extends {
  readonly __types?: { readonly source: infer TSource };
}
  ? TSource extends Readonly<Record<string, unknown>>
    ? TSource
    : TSource
  : unknown;

export type { SourceObjectWithComputed };

/** One declaration's builders, plus the queue `expose` fills. */
export function createEntryBuilders<
  TSubgraph,
  TRequest,
  TInfo,
  TAbstractType,
>(): {
  readonly builders: EntryBuilders<TSubgraph, TRequest, TInfo, TAbstractType>;
  readonly exposed: readonly { readonly name: string | null }[];
} {
  const exposed: { readonly name: string | null }[] = [];

  function root(
    kind: "query" | "mutation" | "subscription",
    key: string,
    options: Record<string, unknown>,
  ): TypedSubgraphEntry {
    const config = snapshotDescriptorOptions(
      options,
      [
        "fieldName",
        "description",
        "deprecated",
        "args",
        "returns",
        "resolve",
        "subscribe",
      ],
      ["options"],
    );
    if (config.returns === undefined) {
      failDefinition({
        code: "PH-SG-ENTRY-INVALID",
        path: ["options", "returns"],
        message: `${kind} ${JSON.stringify(key)} declares no return type.`,
        repair: "Add returns: a field use such as ph.ref(SomeType).",
      });
    }
    const resolve = config.resolve;
    const subscribe = config.subscribe;
    if (kind === "subscription") {
      if (typeof subscribe !== "function") {
        failDefinition({
          code: "PH-SG-ENTRY-INVALID",
          path: ["options", "subscribe"],
          message: `Subscription ${JSON.stringify(key)} declares no subscribe.`,
          repair:
            "Add subscribe, returning an AsyncIterable of the events this subscription emits.",
        });
      }
    } else if (typeof resolve !== "function") {
      failDefinition({
        code: "PH-SG-ENTRY-INVALID",
        path: ["options", "resolve"],
        message: `${kind} ${JSON.stringify(key)} declares no resolve.`,
        repair: "Add resolve.",
      });
    }
    return register({
      kind,
      key,
      fieldName: typeof config.fieldName === "string" ? config.fieldName : key,
      description:
        typeof config.description === "string" ? config.description : null,
      deprecated:
        typeof config.deprecated === "string" ? config.deprecated : null,
      args: (config.args ?? {}) as ObjectFields,
      returns: config.returns as AnyFieldDescriptor,
      ...(typeof resolve === "function" && {
        resolve: resolve as (call: never) => unknown,
      }),
      ...(typeof subscribe === "function" && {
        subscribe: subscribe as (call: never) => unknown,
      }),
    });
  }

  const builders = {
    query: (key: string, options: Record<string, unknown>) =>
      root("query", key, options),
    mutation: (key: string, options: Record<string, unknown>) =>
      root("mutation", key, options),
    subscription: (key: string, options: Record<string, unknown>) =>
      root("subscription", key, options),
    field: (token: AnyComputedToken, options: { resolve: unknown }) => {
      if (
        token === null ||
        typeof token !== "object" ||
        token.kind !== "computed-token"
      ) {
        failDefinition({
          code: "PH-SG-ENTRY-INVALID",
          path: ["token"],
          message: "field() takes a token from Type.computed.",
          repair: "Pass Type.computed.<field>, not a string.",
        });
      }
      return register({
        kind: "computed-field",
        token,
        resolve: options.resolve as (call: never) => unknown,
      });
    },
    resolveType: (type: { readonly name: string | null }, resolve: unknown) =>
      register({
        kind: "resolve-type",
        typeName: namedOrFail(type, "resolveType"),
        resolve: resolve as (call: never) => unknown,
      }),
    isTypeOf: (type: { readonly name: string | null }, resolve: unknown) =>
      register({
        kind: "is-type-of",
        typeName: namedOrFail(type, "isTypeOf"),
        resolve: resolve as (call: never) => unknown,
      }),
    expose: (...types: readonly { readonly name: string | null }[]) => {
      // Call order is preserved: it is what decides definition order for
      // types nothing else reaches.
      exposed.push(...types);
    },
  } as unknown as EntryBuilders<TSubgraph, TRequest, TInfo, TAbstractType>;

  return { builders, exposed };
}

function namedOrFail(
  type: { readonly name: string | null },
  builder: string,
): string {
  if (
    type === null ||
    typeof type !== "object" ||
    typeof type.name !== "string"
  ) {
    failDefinition({
      code: "PH-SG-ENTRY-INVALID",
      path: ["type"],
      message: `${builder} takes a named type descriptor.`,
      repair:
        "Pass the descriptor returned by ph.object, ph.interface, or ph.union.",
    });
  }
  return type.name;
}
