import {
  type ASTNode,
  type DefinitionNode,
  type DocumentNode,
  isTypeDefinitionNode,
  isTypeExtensionNode,
  Kind,
  type NamedTypeNode,
  type TypeDefinitionNode,
  type TypeExtensionNode,
  print,
  visit,
} from "graphql";

const ROOT_TYPE_NAMES = new Set(["Query", "Mutation", "Subscription"]);

/** Normalized definitions by type name or root field (`Query.field`). */
export type SubgraphClaims = ReadonlyMap<string, string>;

type Named = { name: { value: string } };

const byName = <T extends Named>(nodes: readonly T[] | undefined) =>
  nodes &&
  [...nodes].sort((a, b) =>
    a.name.value < b.name.value ? -1 : a.name.value > b.name.value ? 1 : 0,
  );

/** Printed without descriptions, with named members in name order. */
export function normalizeDefinition(node: ASTNode): string {
  const normalized = visit(node, {
    leave(current) {
      const copy: Record<string, unknown> = { ...current };
      delete copy.loc;
      if ("description" in copy) copy.description = undefined;
      if (current.kind === Kind.STRING) copy.block = false;
      for (const key of ["fields", "arguments", "interfaces"]) {
        if (Array.isArray(copy[key])) {
          copy[key] = byName(copy[key] as Named[]);
        }
      }
      if (
        current.kind === Kind.ENUM_TYPE_DEFINITION ||
        current.kind === Kind.ENUM_TYPE_EXTENSION
      ) {
        copy.values = byName(current.values);
      }
      if (
        current.kind === Kind.UNION_TYPE_DEFINITION ||
        current.kind === Kind.UNION_TYPE_EXTENSION
      ) {
        copy.types = byName(current.types as readonly NamedTypeNode[]);
      }
      return copy as unknown as ASTNode;
    },
  });
  return print(normalized);
}

function isScalar(def: DefinitionNode): boolean {
  return (
    def.kind === Kind.SCALAR_TYPE_DEFINITION ||
    def.kind === Kind.SCALAR_TYPE_EXTENSION
  );
}

/** Type and root-field claims, without scalars or generated types. */
export function collectSubgraphClaims(
  typeDefs: DocumentNode,
  generatedNames: ReadonlySet<string>,
): SubgraphClaims {
  const types = new Map<string, (TypeDefinitionNode | TypeExtensionNode)[]>();
  const claims = new Map<string, string>();
  for (const def of typeDefs.definitions) {
    if (!isTypeDefinitionNode(def) && !isTypeExtensionNode(def)) continue;
    if (isScalar(def)) continue;
    const node: TypeDefinitionNode | TypeExtensionNode = def;
    const name = node.name.value;
    if (ROOT_TYPE_NAMES.has(name)) {
      if (!("fields" in node)) continue;
      for (const field of node.fields ?? []) {
        const key = `${name}.${field.name.value}`;
        const definition = normalizeDefinition(field);
        const previous = claims.get(key);
        claims.set(
          key,
          previous === undefined ? definition : `${previous}\n${definition}`,
        );
      }
      continue;
    }
    if (isTypeDefinitionNode(node) && generatedNames.has(name)) continue;
    const nodes = types.get(name) ?? [];
    nodes.push(node);
    types.set(name, nodes);
  }
  for (const [name, nodes] of types) {
    const merged = mergeTypeNodes(nodes);
    claims.set(
      name,
      merged
        ? normalizeDefinition(merged)
        : nodes.map(normalizeDefinition).sort().join("\n"),
    );
  }
  return claims;
}

const EXTENSION_KINDS: Partial<Record<Kind, Kind>> = {
  [Kind.OBJECT_TYPE_DEFINITION]: Kind.OBJECT_TYPE_EXTENSION,
  [Kind.INTERFACE_TYPE_DEFINITION]: Kind.INTERFACE_TYPE_EXTENSION,
  [Kind.UNION_TYPE_DEFINITION]: Kind.UNION_TYPE_EXTENSION,
  [Kind.ENUM_TYPE_DEFINITION]: Kind.ENUM_TYPE_EXTENSION,
  [Kind.INPUT_OBJECT_TYPE_DEFINITION]: Kind.INPUT_OBJECT_TYPE_EXTENSION,
};

/** One definition plus its same-kind extensions, as a single definition. */
function mergeTypeNodes(
  nodes: readonly (TypeDefinitionNode | TypeExtensionNode)[],
): ASTNode | undefined {
  if (nodes.length === 1) return nodes[0];
  const definitions = nodes.filter(isTypeDefinitionNode);
  if (definitions.length !== 1) return undefined;
  const [definition] = definitions;
  const extensionKind = EXTENSION_KINDS[definition.kind];
  const merged: Record<string, readonly unknown[] | undefined> = {
    ...(definition as unknown as Record<string, readonly unknown[]>),
  };
  for (const node of nodes) {
    if (node === definition) continue;
    if (node.kind !== extensionKind) return undefined;
    const members = node as unknown as Record<string, readonly unknown[]>;
    for (const key of [
      "fields",
      "interfaces",
      "values",
      "types",
      "directives",
    ]) {
      const extra = members[key] as readonly unknown[] | undefined;
      if (extra) merged[key] = [...(merged[key] ?? []), ...extra];
    }
  }
  return merged as unknown as ASTNode;
}

function isRootFieldClaim(claim: string): boolean {
  return claim.includes(".");
}

export type OwnershipConflict = { claim: string; owner: string };

/** Candidates, in priority order, that lose a claim to an earlier one. */
export function resolveClaimOwnership<T>(
  candidates: Iterable<{ candidate: T; name: string; claims: SubgraphClaims }>,
): Map<T, OwnershipConflict[]> {
  const owners = new Map<string, { definition: string; owner: string }>();
  const excluded = new Map<T, OwnershipConflict[]>();
  for (const { candidate, name, claims } of candidates) {
    const conflicts: OwnershipConflict[] = [];
    for (const [claim, definition] of claims) {
      const owned = owners.get(claim);
      // A root field has one resolver, so only its owner may serve it.
      if (
        owned &&
        (isRootFieldClaim(claim) || owned.definition !== definition)
      ) {
        conflicts.push({ claim, owner: owned.owner });
      }
    }
    if (conflicts.length > 0) {
      excluded.set(candidate, conflicts);
      continue;
    }
    for (const [claim, definition] of claims) {
      if (!owners.has(claim)) owners.set(claim, { definition, owner: name });
    }
  }
  return excluded;
}

export function describeOwnershipConflicts(
  conflicts: readonly OwnershipConflict[],
): string {
  return `claims owned by another subgraph: ${conflicts
    .map(({ claim, owner }) => `${claim} (owned by "${owner}")`)
    .join(", ")}`;
}
