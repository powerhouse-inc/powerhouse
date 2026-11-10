import type {
  DefinitionDiagnostic,
  SubgraphDefinition,
} from "@powerhousedao/shared/document-model";

/**
 * @experimental The static member that marks a code-first subgraph class.
 * `Symbol.for` makes it the same key in every copy of the package; the
 * protocol's `version` says which contract the class speaks.
 */
export const SUBGRAPH_PROTOCOL: unique symbol = Symbol.for(
  "powerhouse.subgraph.protocol",
);

/**
 * @experimental A code-first class's description. `name` is absent on a
 * base class that declares no `subgraphName`.
 */
export type SubgraphDescription = {
  readonly name?: string;
  readonly definition?: SubgraphDefinition;
  readonly diagnostics: readonly DefinitionDiagnostic[];
};

/**
 * @experimental The contract a code-first subgraph class exposes under
 * `SUBGRAPH_PROTOCOL`. Both methods run in the copy that defined the class.
 */
export type SubgraphProtocol = {
  readonly version: 1;
  describe(): SubgraphDescription;
  validate(
    instance: unknown,
  ): { readonly ok: true } | { readonly ok: false; readonly message: string };
};

/**
 * @experimental How a host treats a subgraph export. `unsupported` covers a
 * protocol of another version and a malformed one, and carries the version
 * it read.
 */
export type SubgraphProtocolRead =
  | { readonly kind: "schema-first" }
  | { readonly kind: "code-first"; readonly protocol: SubgraphProtocol }
  | { readonly kind: "unsupported"; readonly version: unknown };

/**
 * @experimental Reads the protocol of a subgraph export. It reads only the
 * static `SUBGRAPH_PROTOCOL` member of a function: it never constructs the
 * class or calls the protocol.
 */
export function readSubgraphProtocol(value: unknown): SubgraphProtocolRead {
  if (typeof value !== "function") return { kind: "schema-first" };
  const protocol: unknown = (value as { [SUBGRAPH_PROTOCOL]?: unknown })[
    SUBGRAPH_PROTOCOL
  ];
  if (protocol === undefined) return { kind: "schema-first" };
  if (protocol === null || typeof protocol !== "object") {
    return { kind: "unsupported", version: undefined };
  }
  const candidate = protocol as Partial<
    Record<keyof SubgraphProtocol, unknown>
  >;
  if (
    candidate.version === 1 &&
    typeof candidate.describe === "function" &&
    typeof candidate.validate === "function"
  ) {
    return { kind: "code-first", protocol: protocol as SubgraphProtocol };
  }
  return { kind: "unsupported", version: candidate.version };
}
