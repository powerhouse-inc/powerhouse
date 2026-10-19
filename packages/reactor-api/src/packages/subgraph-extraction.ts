import type { SubgraphClass } from "@powerhousedao/reactor-api";
import { isSubgraphClass } from "../graphql/utils.js";

/**
 * The one acceptance rule for a package's `subgraphs` module.
 *
 * All three package loaders (vite, import, http) consume the same generated
 * `subgraphs/index` file, and each used to apply its own rule — the vite
 * loader required a namespace whose alias equalled the class name inside it,
 * the http loader took any function one level deep, and the import loader
 * took every nested value. An export that registered under one loader could
 * silently vanish under another (the codegen-does-not-register-subgraphs
 * report). This is now the single rule they all share:
 *
 * - an export that is itself a subgraph class is accepted (named or default
 *   export of the class);
 * - any subgraph class among the values of an exported object is accepted
 *   (a `export * as Alias from ...` namespace under any alias, or a
 *   default-exported object of classes);
 * - everything else — constants, configs, functions and classes that do not
 *   extend BaseSubgraph — is dropped.
 *
 * Codegen emits `export * as <ClassName> from "./<dir>/index.js"`
 * (makeSubgraphsIndexFile in packages/codegen), which the namespace branch
 * accepts regardless of the alias; hand-written packages may re-export a
 * class directly, which the direct branch accepts. A class reached through
 * both branches is returned once.
 */
export function extractSubgraphs(
  namespace: Record<string, unknown>,
): SubgraphClass[] {
  const found: SubgraphClass[] = [];
  const add = (candidate: unknown) => {
    if (isSubgraphClass(candidate) && !found.includes(candidate)) {
      found.push(candidate);
    }
  };
  for (const value of Object.values(namespace)) {
    add(value);
    if (value !== null && typeof value === "object") {
      for (const inner of Object.values(value)) {
        add(inner);
      }
    }
  }
  return found;
}
