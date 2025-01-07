import { Subgraph } from "./base";

export * as analyticsSubgraph from "./analytics";
export * as driveSubgraph from "./drive";
export * as systemSubgraph from "./system";
export * as authSubgraph from "./auth";
export * from "./types";
export { Subgraph } from "./base";

export type SubgraphClass = typeof Subgraph;
export function isSubgraphClass(
  candidate: unknown,
): candidate is SubgraphClass {
  if (typeof candidate !== "function") return false;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  let proto = Object.getPrototypeOf(candidate);
  while (proto) {
    if (Object.prototype.isPrototypeOf.call(proto, Subgraph)) return true;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    proto = Object.getPrototypeOf(proto);
  }

  return false;
}
