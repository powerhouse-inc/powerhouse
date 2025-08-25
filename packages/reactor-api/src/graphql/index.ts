import { Subgraph } from "./base/index.js";

export * as analyticsSubgraph from "./analytics/index.js";
export { Subgraph } from "./base/index.js";
export * as driveSubgraph from "./drive/index.js";
export * as systemSubgraph from "./system/index.js";
export * from "./types.js";

export type SubgraphClass = typeof Subgraph;
export function isSubgraphClass(
  candidate: unknown,
): candidate is SubgraphClass {
  if (typeof candidate !== "function") return false;

  let proto = Object.getPrototypeOf(candidate);
  while (proto) {
    if (Object.prototype.isPrototypeOf.call(proto, Subgraph)) return true;

    proto = Object.getPrototypeOf(proto);
  }

  return false;
}
