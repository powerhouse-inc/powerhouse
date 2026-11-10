/**
 * @experimental Thrown when the host refuses a code-first subgraph class or
 * instance, and by the `Subgraph` constructor of a class that cannot compile.
 */
export class CodeFirstSubgraphError extends Error {
  override readonly name = "CodeFirstSubgraphError";
}
