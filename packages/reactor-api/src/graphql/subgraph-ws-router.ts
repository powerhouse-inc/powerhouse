import type { ILogger } from "document-model";
import {
  type DocumentNode,
  getOperationAST,
  GraphQLError,
  type GraphQLSchema,
  Kind,
  type OperationDefinitionNode,
  type SelectionSetNode,
} from "graphql";
import type { WebSocketServer } from "ws";
import type { WsDisposer, WsHandlers } from "./gateway/types.js";
import { useServer } from "./websocket.js";

type Route<TOwner> = {
  owner: TOwner;
  schema: GraphQLSchema;
  running: Set<AsyncGenerator>;
  ended: boolean;
};

type Operation<TOwner> = { route: Route<TOwner>; result?: AsyncGenerator };

/** One graphql-ws server; each operation goes to the first route whose root type has its fields. */
export class SubgraphWsRouter<TOwner, TContext> {
  readonly #routes = new Map<string, Route<TOwner>>();
  readonly #operations = new WeakMap<object, Map<string, Operation<TOwner>>>();
  readonly #order: (owners: TOwner[]) => TOwner[];
  readonly #logger: ILogger;
  #disposer: WsDisposer | undefined;

  constructor(options: {
    order: (owners: TOwner[]) => TOwner[];
    logger: ILogger;
  }) {
    this.#order = options.order;
    this.#logger = options.logger;
  }

  attach(wsServer: WebSocketServer, handlers: WsHandlers<TContext>): void {
    if (this.#disposer) return;
    this.#disposer = useServer(
      {
        onConnect: (ctx) =>
          handlers.onConnect(ctx.connectionParams ?? {}, ctx.extra as object),
        context: (ctx) =>
          handlers.context(ctx.connectionParams ?? {}, ctx.extra as object),
        onSubscribe: () =>
          this.#routes.size === 0
            ? [new GraphQLError("No subgraph serves subscriptions")]
            : undefined,
        // Validation stays with graphql-ws, whose graphql built the schemas.
        schema: (ctx, id, _payload, args) => {
          const route = this.#route(args.document, args.operationName);
          if (!route) throw new Error("No subgraph serves subscriptions");
          this.#operationsOf(ctx).set(id, { route });
          return route.schema;
        },
        onOperation: (ctx, id, _payload, _args, result) => {
          const operation = this.#operations.get(ctx)?.get(id);
          if (!operation || !isAsyncGenerator(result)) return;
          operation.result = result;
          operation.route.running.add(result);
          if (operation.route.ended) void this.#end([result]);
        },
        onComplete: (ctx, id) => {
          const operations = this.#operations.get(ctx);
          const operation = operations?.get(id);
          operations?.delete(id);
          if (operation?.result) {
            operation.route.running.delete(operation.result);
          }
        },
      },
      wsServer,
    );
  }

  /** Serve `owner`'s operations at `path` with `schema`. */
  set(path: string, owner: TOwner, schema: GraphQLSchema): void {
    const route = this.#routes.get(path);
    if (route?.owner === owner) {
      route.schema = schema;
      return;
    }
    this.#routes.set(path, { owner, schema, running: new Set(), ended: false });
    if (route) this.#endRoute(route);
  }

  /** Stop serving `path`, if `owner` still holds it. */
  delete(path: string, owner: TOwner): void {
    const route = this.#routes.get(path);
    if (route?.owner !== owner) return;
    this.#routes.delete(path);
    this.#endRoute(route);
  }

  async dispose(): Promise<void> {
    const disposer = this.#disposer;
    this.#disposer = undefined;
    this.#routes.clear();
    await disposer?.dispose();
  }

  #route(
    document: DocumentNode,
    operationName: string | null | undefined,
  ): Route<TOwner> | undefined {
    const routes = [...this.#routes.values()];
    const owners = this.#order([...new Set(routes.map((r) => r.owner))]);
    routes.sort((a, b) => owners.indexOf(a.owner) - owners.indexOf(b.owner));
    const operation = getOperationAST(document, operationName);
    if (!operation) return routes[0];
    const fields = rootFields(document, operation);
    return (
      routes.find((route) => {
        const root = route.schema.getRootType(operation.operation);
        if (!root) return false;
        const available = root.getFields();
        return fields.every((field) => field in available);
      }) ?? routes[0]
    );
  }

  #operationsOf(ctx: object): Map<string, Operation<TOwner>> {
    let operations = this.#operations.get(ctx);
    if (!operations) {
      operations = new Map();
      this.#operations.set(ctx, operations);
    }
    return operations;
  }

  #endRoute(route: Route<TOwner>): void {
    route.ended = true;
    void this.#end(route.running);
  }

  // graphql-ws sends `complete` once the result's iteration ends.
  async #end(results: Iterable<AsyncGenerator>): Promise<void> {
    await Promise.all(
      Array.from(results, async (result) => {
        try {
          await result.return(undefined);
        } catch (error) {
          this.#logger.error(
            "Error ending a WebSocket subscription: @error",
            error,
          );
        }
      }),
    );
  }
}

function isAsyncGenerator(value: unknown): value is AsyncGenerator {
  return (
    typeof value === "object" &&
    value !== null &&
    Symbol.asyncIterator in value &&
    typeof (value as { return?: unknown }).return === "function"
  );
}

/** An operation's root field names, through fragments, without `__` fields. */
export function rootFields(
  document: DocumentNode,
  operation: OperationDefinitionNode,
): string[] {
  const fragments = new Map(
    document.definitions.flatMap((definition) =>
      definition.kind === Kind.FRAGMENT_DEFINITION
        ? [[definition.name.value, definition.selectionSet] as const]
        : [],
    ),
  );
  const fields = new Set<string>();
  const visited = new Set<string>();
  const collect = (selectionSet: SelectionSetNode) => {
    for (const selection of selectionSet.selections) {
      if (selection.kind === Kind.FIELD) {
        if (!selection.name.value.startsWith("__")) {
          fields.add(selection.name.value);
        }
      } else if (selection.kind === Kind.INLINE_FRAGMENT) {
        collect(selection.selectionSet);
      } else if (!visited.has(selection.name.value)) {
        visited.add(selection.name.value);
        const fragment = fragments.get(selection.name.value);
        if (fragment) collect(fragment);
      }
    }
  };
  collect(operation.selectionSet);
  return [...fields];
}
