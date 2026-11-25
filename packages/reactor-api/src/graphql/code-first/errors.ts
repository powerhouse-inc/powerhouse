/**
 * Thrown when the host refuses a `Subgraph` class or
 * instance, and by the `Subgraph` constructor of a class that cannot compile.
 */
export class SubgraphError extends Error {
  override readonly name = "SubgraphError";
}

/** @deprecated Use {@link SubgraphError}. */
export const CodeFirstSubgraphError = SubgraphError;
/** @deprecated Use {@link SubgraphError}. */
export type CodeFirstSubgraphError = SubgraphError;
