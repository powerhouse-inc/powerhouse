import type { DocumentNode } from "graphql";
import { BaseSubgraph } from "../../src/graphql/base-subgraph.js";

export abstract class PublishedBaseSubgraph extends BaseSubgraph {
  // @ts-expect-error -- TS2416: the tombstone a published package predates.
  declare name?: string;
  // @ts-expect-error -- TS2416
  declare typeDefs?: DocumentNode;
  // @ts-expect-error -- TS2416
  declare resolvers?: Record<string, any>;
  // @ts-expect-error -- TS2416
  declare hasSubscriptions?: boolean;
  // @ts-expect-error -- TS2416
  declare path?: string;
}
