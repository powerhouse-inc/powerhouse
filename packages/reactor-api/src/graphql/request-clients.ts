import type {
  IReactorReadClient,
  IReactorWriteClient,
} from "@powerhousedao/reactor";
import type { GraphQLResolveInfo } from "graphql";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * The reactor client halves a resolver may use, carried on the GraphQL
 * context as `ctx.clients`.
 */
export interface RequestClients {
  /** Answers from read models; always present. */
  readonly read: IReactorReadClient;
  /**
   * Enqueues writes. Present while a mutation executes; reading it in a query
   * or a subscription throws {@link WriteClientUnavailableError}.
   */
  readonly write: IReactorWriteClient;
}

/**
 * The operation a context was built for. `unbound` is a context the host
 * built before it knew the operation, which may not write either.
 */
export type ClientOperation = "query" | "mutation" | "subscription" | "unbound";

/** A resolver outside a mutation asked for the write client. */
export class WriteClientUnavailableError extends Error {
  readonly operation: ClientOperation;
  readonly field: string | undefined;

  constructor(operation: ClientOperation, field: string | undefined) {
    const where = field ? `field ${field}` : "this resolver";
    const running =
      operation === "unbound" ? "outside a mutation" : `in a ${operation}`;
    super(
      `ctx.clients.write is only available to Mutation fields; ${where} runs ${running}. Read through ctx.clients.read.`,
    );
    this.name = "WriteClientUnavailableError";
    this.operation = operation;
    this.field = field;
  }

  static override isError(
    error: unknown,
  ): error is WriteClientUnavailableError {
    return (
      error instanceof Error && error.name === "WriteClientUnavailableError"
    );
  }
}

/** The field whose resolver is running, so a refusal can name it. */
const executingField = new AsyncLocalStorage<string>();

const operations = new WeakMap<RequestClients, ClientOperation>();

/**
 * The clients for one operation: both halves for a mutation, the read half
 * and a refusing `write` for anything else. The refusing property is not
 * enumerable, so spreading or printing the clients does not trip it.
 */
export function createRequestClients(
  read: IReactorReadClient,
  write: IReactorWriteClient,
  operation: ClientOperation,
): RequestClients {
  let clients: RequestClients;
  if (operation === "mutation") {
    clients = Object.freeze({ read, write });
  } else {
    const gated = { read } as { read: IReactorReadClient };
    Object.defineProperty(gated, "write", {
      enumerable: false,
      get(): never {
        throw new WriteClientUnavailableError(
          operation,
          executingField.getStore(),
        );
      },
    });
    clients = Object.freeze(gated) as RequestClients;
  }
  operations.set(clients, operation);
  return clients;
}

/**
 * The read half alone, for a context nobody bound to an operation (a resolver
 * called directly rather than through the GraphQL layer). `write` refuses.
 */
export function readOnlyClients(read: IReactorReadClient): RequestClients {
  return createRequestClients(read, UNAVAILABLE_WRITE, "unbound");
}

/** Never reached: a non-mutation client set refuses before handing it out. */
const UNAVAILABLE_WRITE = {} as IReactorWriteClient;

/**
 * Both halves for a field that reads write-side state outside a mutation. The
 * clients still report `operation`, so identifiers resolve on the read side.
 */
function createWriteSideClients(
  read: IReactorReadClient,
  write: IReactorWriteClient,
  operation: ClientOperation,
): RequestClients {
  const clients: RequestClients = Object.freeze({ read, write });
  operations.set(clients, operation);
  return clients;
}

/**
 * The operation the clients were built for, or undefined for clients that
 * {@link createRequestClients} did not build (a hand-made pair in a test).
 */
export function operationOfClients(
  clients: RequestClients | undefined,
): ClientOperation | undefined {
  return clients === undefined ? undefined : operations.get(clients);
}

type ClientsContext = { clients: RequestClients };

type FieldResolver = (
  parent: unknown,
  args: unknown,
  context: unknown,
  info: GraphQLResolveInfo,
) => unknown;

type TypeResolver = (
  value: unknown,
  context: unknown,
  info: GraphQLResolveInfo,
) => unknown;

/**
 * A resolver map's own object, as opposed to a scalar or another class
 * instance, which passes through. Checked by prototype rather than with
 * `isScalarType`, which refuses a scalar from another copy of graphql.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Type-level resolvers that receive the context; each is `(value, ctx, info)`. */
const TYPE_LEVEL_RESOLVERS = new Set([
  "__resolveReference",
  "__resolveType",
  "__isTypeOf",
]);

/**
 * Puts the client halves on the GraphQL context per operation. The host builds
 * one context per request (or per WebSocket operation) before it knows what
 * the operation is; every resolver this binder wraps receives instead a
 * context derived from that one for the operation it is running in, so a
 * mutation gets `ctx.clients.write` and a query or subscription does not.
 *
 * The derived context is memoized per request context and operation, so every
 * field of one operation sees the same object, which per-request memos key on.
 */
export class RequestClientBinder {
  readonly #read: IReactorReadClient;
  readonly #write: IReactorWriteClient;
  readonly #contexts = new WeakMap<object, Map<string, ClientsContext>>();
  readonly #derived = new WeakSet<object>();
  readonly #wrapped = new WeakMap<object, Record<string, unknown>>();

  constructor(read: IReactorReadClient, write: IReactorWriteClient) {
    this.#read = read;
    this.#write = write;
  }

  /** The clients for a context the host builds before the operation is known. */
  unboundClients(): RequestClients {
    return createRequestClients(this.#read, this.#write, "unbound");
  }

  /**
   * The context a resolver of `operation` receives for request context `base`.
   * `writeSide` hands a query field the write client too: a field declared to
   * read write-side state.
   */
  contextFor<TContext extends object>(
    base: TContext,
    operation: ClientOperation,
    writeSide = false,
  ): TContext & ClientsContext {
    if (this.#derived.has(base)) {
      return base as TContext & ClientsContext;
    }
    let byOperation = this.#contexts.get(base);
    if (!byOperation) {
      byOperation = new Map();
      this.#contexts.set(base, byOperation);
    }
    const key = writeSide ? `${operation}:write-side` : operation;
    let derived = byOperation.get(key);
    if (!derived) {
      derived = {
        ...base,
        clients: writeSide
          ? createWriteSideClients(this.#read, this.#write, operation)
          : createRequestClients(this.#read, this.#write, operation),
      };
      this.#derived.add(derived);
      byOperation.set(key, derived);
    }
    return derived as TContext & ClientsContext;
  }

  /**
   * A copy of a subgraph's resolver map whose resolvers receive the context
   * for their operation. Scalars, enums and non-function members pass through.
   * `writeSideFields` names the fields (`Type.field`) handed the write client
   * whatever their operation. The copy is memoized per map.
   */
  bindResolvers<TResolvers extends Record<string, unknown>>(
    resolvers: TResolvers,
    writeSideFields: ReadonlySet<string> = new Set(),
  ): TResolvers {
    const cached = this.#wrapped.get(resolvers);
    if (cached) {
      return cached as TResolvers;
    }
    const bound: Record<string, unknown> = {};
    for (const [typeName, typeResolvers] of Object.entries(resolvers)) {
      bound[typeName] = this.#bindType(
        typeName,
        typeResolvers,
        writeSideFields,
      );
    }
    this.#wrapped.set(resolvers, bound);
    return bound as TResolvers;
  }

  #bindType(
    typeName: string,
    typeResolvers: unknown,
    writeSideFields: ReadonlySet<string>,
  ): unknown {
    if (!isPlainObject(typeResolvers)) {
      return typeResolvers;
    }
    const bound: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(typeResolvers)) {
      const writeSide = writeSideFields.has(`${typeName}.${field}`);
      if (typeof value === "function") {
        bound[field] = TYPE_LEVEL_RESOLVERS.has(field)
          ? this.#bindTypeResolver(value as TypeResolver)
          : field.startsWith("__")
            ? value
            : this.#bindFieldResolver(value as FieldResolver, writeSide);
      } else if (isPlainObject(value)) {
        const config = { ...(value as Record<string, unknown>) };
        for (const key of ["resolve", "subscribe"]) {
          if (typeof config[key] === "function") {
            config[key] = this.#bindFieldResolver(
              config[key] as FieldResolver,
              writeSide,
            );
          }
        }
        bound[field] = config;
      } else {
        bound[field] = value;
      }
    }
    return bound;
  }

  #bindFieldResolver(
    resolver: FieldResolver,
    writeSide: boolean,
  ): FieldResolver {
    return (parent, args, context, info) => {
      if (!info?.operation) {
        return resolver(parent, args, context, info);
      }
      const derived = this.contextFor(
        (context ?? {}) as object,
        info.operation.operation as ClientOperation,
        writeSide,
      );
      return executingField.run(
        `${info.parentType.name}.${info.fieldName}`,
        () => resolver(parent, args, derived, info),
      );
    };
  }

  #bindTypeResolver(resolver: TypeResolver): TypeResolver {
    return (value, context, info) => {
      if (!info?.operation) {
        return resolver(value, context, info);
      }
      return resolver(
        value,
        this.contextFor(
          (context ?? {}) as object,
          info.operation.operation as ClientOperation,
        ),
        info,
      );
    };
  }
}
