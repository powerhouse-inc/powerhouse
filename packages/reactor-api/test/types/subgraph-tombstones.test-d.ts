import type { DocumentNode } from "graphql";
import { gql } from "graphql-tag";
import { expectTypeOf } from "vitest";
import { BaseSubgraph } from "../../src/graphql/base-subgraph.js";
import type { SubgraphArgs } from "../../src/graphql/types.js";

expectTypeOf<BaseSubgraph["name"]>().toEqualTypeOf<undefined>();
expectTypeOf<BaseSubgraph["typeDefs"]>().toEqualTypeOf<undefined>();
expectTypeOf<BaseSubgraph["resolvers"]>().toEqualTypeOf<undefined>();
expectTypeOf<BaseSubgraph["hasSubscriptions"]>().toEqualTypeOf<undefined>();
expectTypeOf<BaseSubgraph["path"]>().toEqualTypeOf<undefined>();
expectTypeOf<
  Pick<
    BaseSubgraph,
    "name" | "typeDefs" | "resolvers" | "hasSubscriptions" | "path"
  >
>().toEqualTypeOf<{
  readonly name?: never;
  readonly typeDefs?: never;
  readonly resolvers?: never;
  readonly hasSubscriptions?: never;
  readonly path?: never;
}>();

export class OldStyle extends BaseSubgraph {
  // @ts-expect-error -- TS2416: name is a tombstone; declare static subgraphName.
  name = "old-style";
  // @ts-expect-error -- TS2416: typeDefs is a tombstone; return them from getSchema.
  typeDefs: DocumentNode = gql`
    type Query {
      old: String
    }
  `;
  // @ts-expect-error -- TS2416: resolvers is a tombstone; return them from getSchema.
  resolvers = { Query: { old: () => "old" } };
  // @ts-expect-error -- TS2416: hasSubscriptions is a tombstone; it is derived.
  hasSubscriptions = false;
  // @ts-expect-error -- TS2416: path is a tombstone; routing never read it.
  path = "/old";
}

export class AssignsInConstructor extends BaseSubgraph {
  constructor(args: SubgraphArgs) {
    super(args);
    // @ts-expect-error -- TS2540: name is a read-only tombstone.
    this.name = "assigned";
  }
}
