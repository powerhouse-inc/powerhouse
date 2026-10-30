import type { IRelationalDb } from "@powerhousedao/shared/processors";
import {
  Kind,
  type DocumentNode,
  type FieldDefinitionNode,
  type TypeNode,
} from "graphql";
import {
  applyReadableFilter,
  type ApplyReadableFilterOptions,
  type ReadableFilter,
} from "../services/readable-documents.js";
import { BaseSubgraph } from "./base-subgraph.js";
import type { Context } from "./types.js";

/**
 * An index subgraph: a read model's query surface with the permission check
 * declared, not hand-written. The subgraph says, per GraphQL field, which
 * argument names the scope (the drive) and how its rows relate to documents;
 * one wrapper applies the host's readable-documents filter around the
 * handler, so no query can forget it and a coverage check can prove it.
 *
 * Row shapes:
 * - `document`: one row is one document, named by `column`;
 * - `derived`: a row is computed over document rows (a count, a total, a
 *   facet) and is filtered through the same column before aggregation, so
 *   it never counts a document the caller could not open;
 * - `public`: the field serves nothing document-derived; said explicitly.
 *
 * A handler is a pure data function: it gets the drive's namespaced query
 * builder, the arguments, and `restrict(query, column?)`, which applies the
 * caller's filter to any query over the index (a refused caller gets `where
 * false`, so the handler never branches on access).
 */

export type IndexRowShape = "document" | "derived";

export type IndexFieldAccess =
  | {
      rows: IndexRowShape;
      /** The column naming the row's document; qualified when the query joins. */
      column: string;
      passWhen?: ApplyReadableFilterOptions["passWhen"];
    }
  | { public: true };

export interface IndexAccess {
  /** The argument that names the scope document, on every field. */
  scope: { drive: string };
  /** Per `Type.field`, for every field of every query container type. */
  fields: Record<string, IndexFieldAccess>;
}

export interface IndexQuery<QB, TArgs = Record<string, unknown>> {
  args: TArgs;
  ctx: Context;
  /** The index's query builder for the scope drive. */
  db: QB;
  scope: { drive: string };
  access: ReadableFilter;
  /** The caller's filter on a query over the index; `column` defaults to the field's. */
  restrict: <Q extends { where(...args: any[]): Q }>(
    query: Q,
    column?: string,
  ) => Q;
}

export type IndexQueryHandler<QB> = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: IndexQuery<QB, any>,
) => unknown;

export interface IndexSubgraphDefinition<QB> {
  name: string;
  typeDefs: DocumentNode;
  /** The index's namespaced query builder for a drive (the processor's `query`). */
  index: (driveId: string, relationalDb: IRelationalDb) => QB;
  access: IndexAccess;
  /** Per `Type.field`: the pure handler. */
  queries: Record<string, IndexQueryHandler<QB>>;
  /** Everything else: root objects, enum and field mappers. */
  resolvers?: Record<string, Record<string, unknown>>;
}

const NO_RESTRICTION = <Q>(query: Q): Q => query;

/** The named type behind lists and non-nulls. */
function namedType(type: TypeNode): string {
  return type.kind === Kind.NAMED_TYPE ? type.name.value : namedType(type.type);
}

/** The query container types (`type Query { emailIndex: EmailIndexQueries! }`) and their fields. */
function queryContainers(
  typeDefs: DocumentNode,
): Map<string, readonly FieldDefinitionNode[]> {
  const types = new Map<string, readonly FieldDefinitionNode[]>();
  for (const def of typeDefs.definitions) {
    if (
      def.kind === Kind.OBJECT_TYPE_DEFINITION ||
      def.kind === Kind.OBJECT_TYPE_EXTENSION
    ) {
      types.set(def.name.value, def.fields ?? []);
    }
  }
  const containers = new Map<string, readonly FieldDefinitionNode[]>();
  for (const field of types.get("Query") ?? []) {
    const name = namedType(field.type);
    const fields = types.get(name);
    if (fields) containers.set(name, fields);
  }
  return containers;
}

/**
 * Every field of every query container type has a handler and an access
 * entry whose scope argument the field takes; nothing is declared that the
 * schema does not have. Throws naming each gap: the definition fails where
 * it is written, not on the first refused request.
 */
export function assertIndexAccessComplete<QB>(
  definition: Pick<
    IndexSubgraphDefinition<QB>,
    "name" | "typeDefs" | "access" | "queries"
  >,
): void {
  const containers = queryContainers(definition.typeDefs);
  const known = new Set<string>();
  const problems: string[] = [];
  const entries: Record<string, IndexFieldAccess | undefined> =
    definition.access.fields;
  for (const [type, fields] of containers) {
    for (const field of fields) {
      const key = `${type}.${field.name.value}`;
      known.add(key);
      const access = entries[key];
      if (!access) {
        problems.push(
          `${key}: no access entry (declare rows/column, or public: true)`,
        );
      }
      if (!(key in definition.queries))
        problems.push(`${key}: no query handler`);
      if (access && !("public" in access)) {
        const arg = definition.access.scope.drive;
        if (!field.arguments?.some((a) => a.name.value === arg)) {
          problems.push(
            `${key}: takes no "${arg}" argument, which names its scope`,
          );
        }
        if (access.column.trim() === "") {
          problems.push(`${key}: no column names the row's document`);
        }
      }
    }
  }
  for (const key of Object.keys(definition.access.fields)) {
    if (!known.has(key))
      problems.push(`${key}: declared, but not a query field of the schema`);
  }
  for (const key of Object.keys(definition.queries)) {
    if (!known.has(key))
      problems.push(
        `${key}: has a handler, but is not a query field of the schema`,
      );
  }
  if (containers.size === 0)
    problems.push("the schema's Query type names no container type");
  if (problems.length > 0) {
    throw new Error(
      `Index subgraph "${definition.name}" is not fully declared:\n- ${problems.join("\n- ")}`,
    );
  }
}

/** The subgraph class the host registers; validated at definition time. */
export function defineIndexSubgraph<QB>(
  definition: IndexSubgraphDefinition<QB>,
): new (args: ConstructorParameters<typeof BaseSubgraph>[0]) => BaseSubgraph {
  assertIndexAccessComplete(definition);
  return class IndexSubgraph extends BaseSubgraph {
    override name = definition.name;
    override typeDefs = definition.typeDefs;
    override resolvers: Record<string, Record<string, unknown>> =
      buildResolvers(definition, this);
    additionalContextFields = {};
    override async onSetup(): Promise<void> {}
    override async onDisconnect(): Promise<void> {}
  };
}

function buildResolvers<QB>(
  definition: IndexSubgraphDefinition<QB>,
  subgraph: BaseSubgraph,
): Record<string, Record<string, unknown>> {
  const resolvers: Record<string, Record<string, unknown>> = {};
  for (const [type, fields] of Object.entries(definition.resolvers ?? {})) {
    resolvers[type] = { ...fields };
  }
  for (const [key, handler] of Object.entries(definition.queries)) {
    const [type, field] = key.split(".") as [string, string];
    const access = definition.access.fields[key]!;
    (resolvers[type] ??= {})[field] = async (
      _parent: unknown,
      args: Record<string, unknown>,
      ctx: Context,
    ) => {
      const driveId = String(args[definition.access.scope.drive]);
      const filter: ReadableFilter =
        "public" in access
          ? { kind: "all" }
          : await subgraph.indexAccess(ctx, driveId);
      const restrict: IndexQuery<QB>["restrict"] =
        "public" in access
          ? NO_RESTRICTION
          : (query, column = access.column) =>
              applyReadableFilter(query, column, filter, {
                passWhen: access.passWhen,
              });
      return handler({
        args,
        ctx,
        db: definition.index(driveId, subgraph.relationalDb),
        scope: { drive: driveId },
        access: filter,
        restrict,
      });
    };
  }
  return resolvers;
}
