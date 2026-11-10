import { SUBGRAPH_PROTOCOL, type SubgraphProtocol } from "document-model";
import { parse } from "graphql";
import { BaseSubgraph } from "../base-subgraph.js";
import type { SubgraphArgs } from "../types.js";
import { bindResolvers } from "./bind.js";
import { compileSubgraphClass } from "./compile.js";
import { CodeFirstSubgraphError } from "./errors.js";
import { recordAssigned, subgraphProtocol } from "./protocol.js";
import type { SchemaBuilder, SubgraphSchemaEntry } from "./schema-builder.js";

/**
 * @experimental A subgraph whose schema and resolvers come from typed
 * entries. A subclass declares `static subgraphName` (lowercase kebab-case)
 * and `static getSchema(schema)`; the constructor assigns `name`,
 * `typeDefs`, `resolvers` and `hasSubscriptions` from them, and the host
 * refuses an instance that changes any of the four.
 *
 * A subclass without `subgraphName` is a base for other code-first
 * subgraphs and cannot be constructed.
 *
 * @example
 * ```ts
 * export class InvoicesSubgraph extends Subgraph {
 *   static override readonly subgraphName = "invoices";
 *   static override getSchema(
 *     schema: SchemaBuilder<InvoicesSubgraph>,
 *   ): readonly SubgraphSchemaEntry<InvoicesSubgraph>[] {
 *     return [
 *       schema.query("invoiceCount", {
 *         type: ph.Int({ required: true }),
 *         resolve: ({ subgraph }) => subgraph.count(),
 *       }),
 *     ];
 *   }
 * }
 * ```
 */
export class Subgraph extends BaseSubgraph {
  /** The name the subgraph is served under. Every served subclass sets it. */
  declare static readonly subgraphName: string;

  declare hasSubscriptions: boolean;

  /**
   * The subgraph's entries. Every served subclass overrides it, typing
   * `schema` as `SchemaBuilder<TheSubclass>`.
   */
  static getSchema(
    // A builder is invariant in its subgraph (`resolveType` takes a
    // callback), so no narrower type admits every subclass's override.
    _schema: SchemaBuilder<any>,
  ): readonly SubgraphSchemaEntry<never>[] {
    return [];
  }

  static get [SUBGRAPH_PROTOCOL](): SubgraphProtocol {
    return subgraphProtocol(this);
  }

  constructor(args: SubgraphArgs) {
    super(args);
    const compilation = compileSubgraphClass(new.target);
    if (compilation.kind === "failed") {
      throw new CodeFirstSubgraphError(
        `${new.target.name} cannot be constructed: ${compilation.reason}`,
      );
    }
    this.name = compilation.name;
    // Each instance owns its document, so editing one cannot change another.
    this.typeDefs = parse(compilation.sdl);
    this.resolvers = bindResolvers(compilation.bindings, this);
    this.hasSubscriptions = compilation.hasSubscriptions;
    recordAssigned(this, compilation.sdl, {
      name: this.name,
      typeDefs: this.typeDefs,
      resolvers: this.resolvers,
      hasSubscriptions: this.hasSubscriptions,
    });
  }
}
