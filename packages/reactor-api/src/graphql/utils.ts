import type { SubgraphClass } from "@powerhousedao/reactor-api";
import { BaseSubgraph } from "./base-subgraph.js";

export function isSubgraphClass(
  candidate: unknown,
): candidate is SubgraphClass {
  if (typeof candidate !== "function") return false;

  let proto: unknown = Object.getPrototypeOf(candidate);
  while (proto) {
    if (Object.prototype.isPrototypeOf.call(proto, BaseSubgraph)) return true;

    proto = Object.getPrototypeOf(proto);
  }

  return false;
}
