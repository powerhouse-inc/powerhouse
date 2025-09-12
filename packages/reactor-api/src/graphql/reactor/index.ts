export { createReactorClient } from "./factory.js";
export type * from "./gen/graphql.js";
export { ReactorSubgraph } from "./subgraph.js";
import { BaseSubgraph } from "../base-subgraph.js";

export class ReactorSubgraph extends BaseSubgraph {
  name = "r/:reactor";
}
