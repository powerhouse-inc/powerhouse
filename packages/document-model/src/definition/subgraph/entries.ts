import { failDefinition } from "../diagnostics.js";
import { isFieldDescriptor } from "../descriptor-registry.js";
import {
  assertFieldUse,
  snapshotDescriptorOptions,
  snapshotFieldMap,
} from "../field-options.js";
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

/** The call the host makes to a field resolver at request time. */
export type FieldInvocation = {
  readonly parent: unknown;
  readonly args: unknown;
  readonly subgraph: unknown;
  readonly request: unknown;
  readonly info: unknown;
};

/** The call the host makes to a `__resolveType` at request time. */
type TypeInvocation = {
  readonly value: unknown;
  readonly subgraph: unknown;
  readonly request: unknown;
  readonly info: unknown;
  readonly abstractType: unknown;
};

export type Bound<TCall> = (call: TCall) => unknown;

type RootEntry = {
  readonly key: string;
  readonly fieldName: string;
  readonly description: string | null;
  readonly deprecated: string | null;
  readonly args: ObjectFields;
  readonly returns: AnyFieldDescriptor;
};

/** The internal shape behind the opaque `TypedSubgraphEntry`. */
export type RegisteredEntry =
  | (RootEntry & {
      readonly kind: "query" | "mutation";
      readonly resolve: Bound<FieldInvocation>;
    })
  | (RootEntry & {
      readonly kind: "subscription";
      readonly subscribe: Bound<FieldInvocation>;
      readonly resolve?: Bound<FieldInvocation>;
    })
  | {
      readonly kind: "computed-field";
      readonly token: AnyComputedToken;
      readonly resolve: Bound<FieldInvocation>;
    }
  | {
      readonly kind: "resolve-type";
      readonly typeName: string;
      readonly resolve: Bound<TypeInvocation>;
    }
  | {
      readonly kind: "is-type-of";
      readonly typeName: string;
      readonly resolve: Bound<FieldInvocation>;
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
    key: unknown,
    options: Record<string, unknown>,
  ): TypedSubgraphEntry {
    if (typeof key !== "string" || key.length === 0) {
      failDefinition({
        code: "PH-SG-ENTRY-INVALID",
        path: ["key"],
        message: `${kind}() takes a field name as a non-empty string.`,
        received: typeof key,
        repair: `Pass the field name first, as ${kind}("widget", { ... }).`,
      });
    }
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
    const subject = `${kind} ${JSON.stringify(key)}`;
    if (config.returns === undefined) {
      failDefinition({
        code: "PH-SG-ENTRY-INVALID",
        path: ["options", "returns"],
        message: `${subject} declares no return type.`,
        repair: "Add returns: a field use such as ph.ref(SomeType).",
      });
    }
    assertFieldUse(config.returns, ["options", "returns"]);
    const shape: RootEntry = {
      key,
      fieldName: typeof config.fieldName === "string" ? config.fieldName : key,
      description:
        typeof config.description === "string" ? config.description : null,
      deprecated:
        typeof config.deprecated === "string" ? config.deprecated : null,
      args: argumentMap(config.args),
      returns: config.returns,
    };
    if (kind === "subscription") {
      const subscribe = resolverOrFail<FieldInvocation>(
        config.subscribe,
        ["options", "subscribe"],
        subject,
        "subscribe",
        "Add subscribe, returning an AsyncIterable of the events this subscription emits.",
      );
      return register({
        ...shape,
        kind,
        subscribe,
        ...(config.resolve !== undefined && {
          resolve: resolverOrFail<FieldInvocation>(
            config.resolve,
            ["options", "resolve"],
            subject,
            "resolve",
            "Pass resolve as a function, or leave it out to read the field from each event.",
          ),
        }),
      });
    }
    const resolve = resolverOrFail<FieldInvocation>(
      config.resolve,
      ["options", "resolve"],
      subject,
    );
    if (config.subscribe !== undefined) {
      failDefinition({
        code: "PH-SG-ENTRY-INVALID",
        path: ["options", "subscribe"],
        message: `${subject} declares subscribe, which only a subscription has.`,
        repair: "Remove subscribe, or declare the entry with subscription().",
      });
    }
    return register({ ...shape, kind, resolve });
  }

  const builders = {
    query: (key: unknown, options: Record<string, unknown>) =>
      root("query", key, options),
    mutation: (key: unknown, options: Record<string, unknown>) =>
      root("mutation", key, options),
    subscription: (key: unknown, options: Record<string, unknown>) =>
      root("subscription", key, options),
    field: (token: unknown, options: unknown) => {
      const { kind, typeName, fieldName }: Partial<Record<string, unknown>> =
        token !== null && typeof token === "object" ? token : {};
      if (
        kind !== "computed-token" ||
        typeof typeName !== "string" ||
        typeof fieldName !== "string"
      ) {
        failDefinition({
          code: "PH-SG-ENTRY-INVALID",
          path: ["token"],
          message: "field() takes a token from Type.computedTokens.",
          repair: "Pass Type.computedTokens.<field>, not a string.",
        });
      }
      const config = snapshotDescriptorOptions(
        options,
        ["resolve"],
        ["options"],
      );
      return register({
        kind: "computed-field",
        token: Object.freeze({ kind, typeName, fieldName }),
        resolve: resolverOrFail<FieldInvocation>(
          config.resolve,
          ["options", "resolve"],
          "field()",
        ),
      });
    },
    resolveType: (type: { readonly name: string | null }, resolve: unknown) =>
      register({
        kind: "resolve-type",
        typeName: namedOrFail(type, "resolveType"),
        resolve: resolverOrFail<TypeInvocation>(
          resolve,
          ["resolve"],
          "resolveType()",
        ),
      }),
    isTypeOf: (type: { readonly name: string | null }, resolve: unknown) =>
      register({
        kind: "is-type-of",
        typeName: namedOrFail(type, "isTypeOf"),
        resolve: resolverOrFail<FieldInvocation>(
          resolve,
          ["resolve"],
          "isTypeOf()",
        ),
      }),
    expose: (...types: readonly { readonly name: string | null }[]) => {
      // Call order is preserved: it is what decides definition order for
      // types nothing else reaches.
      exposed.push(...types);
    },
  } as unknown as EntryBuilders<TSubgraph, TRequest, TInfo, TAbstractType>;

  return { builders, exposed };
}

/**
 * The one place a resolver's call type is asserted: only its being a function
 * can be checked, and the host builds every call this type names.
 */
function resolverOrFail<TCall>(
  value: unknown,
  path: readonly string[],
  subject: string,
  member: "resolve" | "subscribe" = "resolve",
  repair = `Pass ${member} as a function.`,
): Bound<TCall> {
  if (typeof value !== "function") {
    failDefinition({
      code: "PH-SG-ENTRY-INVALID",
      path,
      message:
        value === undefined
          ? `${subject} declares no ${member}.`
          : `${subject} declares a ${member} that is not a function.`,
      received: typeof value,
      repair,
    });
  }
  return value as Bound<TCall>;
}

function argumentMap(value: unknown): ObjectFields {
  if (value === undefined) return {};
  if (isFieldDescriptor(value)) {
    failDefinition({
      code: "PH-SG-ENTRY-INVALID",
      path: ["options", "args"],
      message:
        "args maps each argument name to a field use; it is not a field use itself.",
      received: `field use (${value.kind})`,
      repair: "Key it by argument name, as args: { id: ph.ID() }.",
    });
  }
  const members = snapshotFieldMap(value, ["options", "args"]);
  for (const [key, member] of Object.entries(members)) {
    assertFieldUse(member, ["options", "args", key]);
  }
  return members as ObjectFields;
}

function namedOrFail(type: unknown, builder: string): string {
  const { name }: Partial<Record<string, unknown>> =
    type !== null && typeof type === "object" ? type : {};
  if (typeof name !== "string") {
    failDefinition({
      code: "PH-SG-ENTRY-INVALID",
      path: ["type"],
      message: `${builder} takes a named type descriptor.`,
      repair:
        "Pass the descriptor returned by ph.object, ph.interface, or ph.union.",
    });
  }
  return name;
}
