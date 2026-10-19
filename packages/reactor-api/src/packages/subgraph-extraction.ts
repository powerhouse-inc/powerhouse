import type { SubgraphClass } from "@powerhousedao/reactor-api";
import type { ILogger } from "document-model";
import { isSubgraphName, subgraphClassesIn } from "document-model/tooling";
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
 * - any subgraph class among the values of an exported container is
 *   accepted, at any depth: a module namespace (`export * as Alias from ...`
 *   under any alias, including a namespace that re-exports another), an
 *   array, or a plain object such as a default-exported object of classes;
 * - any subgraph class among the own values of any other exported object,
 *   such as a class instance whose fields hold subgraph classes;
 * - everything else — constants, configs, functions and classes that are not
 *   subgraph classes (see `isSubgraphClass`) — is dropped.
 *
 * A class reached through several paths is returned once, where it is first
 * reached.
 *
 * Once the whole set is collected, a class without its own static
 * `subgraphName` that an exported subgraph extends is a shared base: it is
 * left out, and logged once per package. An exported subgraph here is one
 * whose own name is kebab-case, as a class subgraph's is. Any other nameless
 * class is returned, and registration decides it: an old-style subgraph is
 * served through the legacy adapter, anything else is refused with the
 * migration message.
 */
export function extractSubgraphs(
  namespace: Record<string, unknown>,
  context?: { readonly packageName: string; readonly logger: ILogger },
): SubgraphClass[] {
  const classes = subgraphClassesIn(namespace, isSubgraphClass).map(
    ({ value }) => value,
  );
  const concrete = classes.filter(
    (subgraph) =>
      Object.hasOwn(subgraph, "subgraphName") &&
      isSubgraphName(subgraph.subgraphName),
  );
  return classes.filter((subgraph) => {
    if (Object.hasOwn(subgraph, "subgraphName")) return true;
    const child = concrete.find((candidate) =>
      Object.prototype.isPrototypeOf.call(subgraph, candidate),
    );
    if (child === undefined) return true;
    if (context) logSharedBase(context, subgraph, child);
    return false;
  });
}

const loggedBases = new WeakMap<SubgraphClass, Set<string>>();

function logSharedBase(
  {
    packageName,
    logger,
  }: { readonly packageName: string; readonly logger: ILogger },
  base: SubgraphClass,
  child: SubgraphClass,
): void {
  let packages = loggedBases.get(base);
  if (!packages) {
    packages = new Set();
    loggedBases.set(base, packages);
  }
  if (packages.has(packageName)) return;
  packages.add(packageName);
  logger.info(
    "Treating @base in @package as a shared subgraph base: it has no static subgraphName, and @child extends it",
    base.name,
    packageName,
    child.name,
  );
}
