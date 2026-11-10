import { canonicalJson, compareCodeUnits } from "../../kernel/primitives.js";

/**
 * What a subgraph claims in the supergraph, as the host's ownership rules
 * read it: each root field as `Query.name`, and each other type by name,
 * mapped to a normalized definition. Two subgraphs conflict on a root field
 * they both claim, and on a type they define differently. Scalars claim
 * nothing: the host declares each scalar once.
 */
export type SubgraphClaims = ReadonlyMap<string, string>;

/** The parts of a graphql-js or location-free AST that claims read. */
type AstNode = { readonly kind: string; readonly [key: string]: unknown };

const ROOT_TYPES: ReadonlySet<string> = new Set([
  "Query",
  "Mutation",
  "Subscription",
]);

const TYPE_NODE =
  /^(?:Object|Interface|Union|Enum|InputObject)Type(?:Definition|Extension)$/;

/** Member lists whose order does not change what a type defines. */
const NAMED_MEMBERS: ReadonlySet<string> = new Set([
  "fields",
  "arguments",
  "interfaces",
  "values",
  "types",
]);

const nameOf = (node: unknown): string | undefined => {
  const name = (node as { name?: { value?: unknown } } | null)?.name?.value;
  return typeof name === "string" ? name : undefined;
};

/**
 * Drops locations, descriptions, the block flag of strings and empty
 * members, and sorts named members, so equal definitions compare equal
 * whichever AST printed them.
 */
function normalized(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) {
    const items = value.map((item) => normalized(item));
    return key !== undefined && NAMED_MEMBERS.has(key)
      ? items.sort((left, right) =>
          compareCodeUnits(nameOf(left) ?? "", nameOf(right) ?? ""),
        )
      : items;
  }
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([member, inner]) =>
          member !== "loc" &&
          member !== "description" &&
          member !== "block" &&
          inner !== undefined &&
          !(Array.isArray(inner) && inner.length === 0),
      )
      .map(([member, inner]) => [member, normalized(inner, member)]),
  );
}

const normalizedText = (node: unknown) => canonicalJson(normalized(node));

function merged(nodes: readonly AstNode[]): AstNode | undefined {
  if (nodes.length === 1) return nodes[0];
  const definitions = nodes.filter(({ kind }) => kind.endsWith("Definition"));
  if (definitions.length !== 1) return undefined;
  const [definition] = definitions;
  const extensionKind = definition.kind.replace(/Definition$/, "Extension");
  const result: Record<string, unknown> = { ...definition };
  for (const node of nodes) {
    if (node === definition) continue;
    if (node.kind !== extensionKind) return undefined;
    for (const member of [
      "fields",
      "interfaces",
      "values",
      "types",
      "directives",
    ]) {
      const extra = node[member];
      if (Array.isArray(extra)) {
        result[member] = [
          ...((result[member] as readonly unknown[] | undefined) ?? []),
          ...(extra as readonly unknown[]),
        ];
      }
    }
  }
  return result as AstNode;
}

export function subgraphClaims(document: {
  readonly definitions: readonly object[];
}): SubgraphClaims {
  const types = new Map<string, AstNode[]>();
  const claims = new Map<string, string>();
  for (const definition of document.definitions as readonly AstNode[]) {
    const name = nameOf(definition);
    if (name === undefined || !TYPE_NODE.test(definition.kind)) continue;
    if (ROOT_TYPES.has(name)) {
      const fields = definition.fields;
      if (!Array.isArray(fields)) continue;
      for (const field of fields as readonly AstNode[]) {
        const claim = `${name}.${nameOf(field)}`;
        const text = normalizedText(field);
        const previous = claims.get(claim);
        claims.set(
          claim,
          previous === undefined ? text : `${previous}\n${text}`,
        );
      }
      continue;
    }
    types.set(name, [...(types.get(name) ?? []), definition]);
  }
  for (const [name, nodes] of types) {
    const node = merged(nodes);
    claims.set(
      name,
      node === undefined
        ? nodes.map(normalizedText).sort(compareCodeUnits).join("\n")
        : normalizedText(node),
    );
  }
  return claims;
}

export const isRootFieldClaim = (claim: string) => claim.includes(".");

/** The claims `later` loses to `earlier`: every shared root field, and every type defined differently. */
export function conflictingClaims(
  earlier: SubgraphClaims,
  later: SubgraphClaims,
): readonly string[] {
  return [...later]
    .filter(([claim, text]) => {
      const owned = earlier.get(claim);
      return owned !== undefined && (isRootFieldClaim(claim) || owned !== text);
    })
    .map(([claim]) => claim);
}
