import type {
  DefinitionDiagnostic,
  NamedGraphQLTypeDefinition,
  ResolverCoordinateDefinition,
  SubgraphDefinition,
  SubgraphEntryDefinition,
  SubgraphScalarReferenceDefinition,
} from "@powerhousedao/shared/document-model";
import { createDiagnostic } from "../diagnostics.js";
import { isGraphQLName } from "../primitives.js";
import {
  isReferenceableScalarName,
  SCALAR_CATALOG_NAMES,
} from "../scalars/catalog.js";
import { scalarDefinitionIssues } from "../scalars/definition-shape.js";

/**
 * Validates a subgraph definition at the external wire boundary.
 *
 * A class loaded from a package is data that arrived from somewhere else: it
 * may have been compiled by another release, hand-written, or corrupted in
 * transit. The host and the checker share this one validator, so a shape the
 * checker accepts is a shape the host accepts — adding a stricter predicate to
 * one of them would make a package that checks clean fail to load.
 */

export function checkSubgraphDefinitionShape(
  value: unknown,
  path: readonly (string | number)[] = ["definition"],
): readonly DefinitionDiagnostic[] {
  const at = (...rest: (string | number)[]) => [...path, ...rest].map(String);
  const fail = (
    where: (string | number)[],
    message: string,
    repair: string,
    received?: string,
  ): DefinitionDiagnostic =>
    createDiagnostic({
      code: "PH-SG-DEFINITION-INVALID",
      path: at(...where),
      message,
      ...(received !== undefined && { received }),
      repair,
    });

  if (value === null || typeof value !== "object") {
    return [
      fail(
        [],
        "A subgraph definition must be an object.",
        "Publish the value `defineSubgraph` returned.",
        value === null ? "null" : typeof value,
      ),
    ];
  }
  const definition = value as Partial<SubgraphDefinition>;
  const diagnostics: DefinitionDiagnostic[] = [];

  if (definition.kind !== "powerhouse.subgraph") {
    diagnostics.push(
      fail(
        ["kind"],
        "A subgraph definition is tagged powerhouse.subgraph.",
        "Publish the value `defineSubgraph` returned.",
        String(definition.kind),
      ),
    );
  }
  if (definition.formatVersion !== 1) {
    diagnostics.push(
      fail(
        ["formatVersion"],
        "This release reads format version 1.",
        "Rebuild the package with a matching compiler.",
        String(definition.formatVersion),
      ),
    );
  }
  if (typeof definition.name !== "string" || definition.name.length === 0) {
    diagnostics.push(
      fail(["name"], "A subgraph needs a name.", "Give the subgraph a name."),
    );
  }
  if (definition.compositionPolicy !== "host-current") {
    diagnostics.push(
      fail(
        ["compositionPolicy"],
        "The only composition policy this release serves is host-current.",
        "Rebuild the package with a matching compiler.",
        String(definition.compositionPolicy),
      ),
    );
  }
  if (definition.federationProfile !== "host-current") {
    diagnostics.push(
      fail(
        ["federationProfile"],
        "The only federation profile this release serves is host-current.",
        "Rebuild the package with a matching compiler.",
        String(definition.federationProfile),
      ),
    );
  }

  if (definition.schemaKind === "typed") {
    diagnostics.push(...checkTyped(definition, fail));
  } else if (definition.schemaKind === "graphql-ast-compat") {
    diagnostics.push(...checkCompat(definition, fail));
  } else {
    diagnostics.push(
      fail(
        ["schemaKind"],
        "A subgraph is either typed or graphql-ast-compat.",
        'Set schemaKind to "typed" or "graphql-ast-compat".',
        String(definition.schemaKind),
      ),
    );
  }

  return diagnostics;
}

type Fail = (
  where: (string | number)[],
  message: string,
  repair: string,
  received?: string,
) => DefinitionDiagnostic;

function checkTyped(
  definition: Partial<SubgraphDefinition>,
  fail: Fail,
): readonly DefinitionDiagnostic[] {
  const typed = definition as Extract<
    SubgraphDefinition,
    { schemaKind: "typed" }
  >;
  const diagnostics: DefinitionDiagnostic[] = [];

  if (typeof typed.hasSubscriptions !== "boolean") {
    diagnostics.push(
      fail(
        ["hasSubscriptions"],
        "A typed subgraph states whether it has subscriptions; null is a compatibility value.",
        "Rebuild the package with a matching compiler.",
        String(typed.hasSubscriptions),
      ),
    );
  }
  if (!Array.isArray(typed.types) || !Array.isArray(typed.entries)) {
    return [
      ...diagnostics,
      fail(
        ["types"],
        "A typed subgraph carries its types and its entries.",
        "Rebuild the package with a matching compiler.",
      ),
    ];
  }

  // Names have to be GraphQL names and each has to be declared once: a
  // duplicate would make the emitted schema depend on which one won.
  const seen = new Set<string>();
  typed.types.forEach((type: NamedGraphQLTypeDefinition, index: number) => {
    if (!isGraphQLName(type.name)) {
      diagnostics.push(
        fail(
          ["types", index, "name"],
          `${String(type.name)} is not a GraphQL name.`,
          "Rename the type.",
          String(type.name),
        ),
      );
    }
    if (seen.has(type.name)) {
      diagnostics.push(
        fail(
          ["types", index, "name"],
          `${type.name} is declared twice.`,
          "Declare each type once.",
          type.name,
        ),
      );
    }
    seen.add(type.name);
  });

  // Every entry is manual: authorization is the resolver's own business, and
  // no other marker has a meaning in V1.
  typed.entries.forEach((entry: SubgraphEntryDefinition, index: number) => {
    if (entry.access?.kind !== "manual") {
      diagnostics.push(
        fail(
          ["entries", index, "access"],
          "An entry's access marker is manual.",
          "Rebuild the package with a matching compiler.",
          String(entry.access?.kind),
        ),
      );
    }
  });

  // A subscription entry and the transport flag have to agree, or the host
  // would expose a socket for a schema with nothing to push, or the reverse.
  const declaresSubscription = typed.entries.some(
    (entry: SubgraphEntryDefinition) => entry.kind === "subscription",
  );
  if (declaresSubscription !== typed.hasSubscriptions) {
    diagnostics.push(
      fail(
        ["hasSubscriptions"],
        `hasSubscriptions is ${String(typed.hasSubscriptions)}, and the subgraph ${declaresSubscription ? "declares" : "declares no"} subscription entry.`,
        "Rebuild the package with a matching compiler.",
        String(typed.hasSubscriptions),
      ),
    );
  }

  const catalog = new Set<string>(SCALAR_CATALOG_NAMES);
  const declared = new Set<string>();
  (typed.scalars ?? []).forEach(
    (scalar: SubgraphScalarReferenceDefinition, index: number) => {
      if ("definition" in scalar) {
        diagnostics.push(...packageScalarIssues(scalar, index, declared, fail));
        declared.add(scalar.name);
        return;
      }
      if (!catalog.has(scalar.name)) {
        diagnostics.push(
          fail(
            ["scalars", index, "name"],
            `${scalar.name} is not a catalog scalar.`,
            `Use one of ${[...catalog].sort().join(", ")}.`,
            scalar.name,
          ),
        );
      }
      if (scalar.implementation !== `powerhouse.catalog#${scalar.name}`) {
        diagnostics.push(
          fail(
            ["scalars", index, "implementation"],
            `${scalar.name} names an implementation it does not match.`,
            "Rebuild the package with a matching compiler.",
            scalar.implementation,
          ),
        );
      }
    },
  );

  // The order is the emitted schema's, so it has to be a permutation of what
  // is emitted: a partial one would silently drop whatever it forgot.
  const emitted = new Set<string>([
    ...(typed.scalars ?? []).map(
      (scalar: SubgraphScalarReferenceDefinition) => scalar.name as string,
    ),
    ...typed.types.map((type: NamedGraphQLTypeDefinition) => type.name),
  ]);
  const ordered = new Set(typed.definitionOrder ?? []);
  for (const name of emitted) {
    if (!ordered.has(name)) {
      diagnostics.push(
        fail(
          ["definitionOrder"],
          `definitionOrder omits ${name}.`,
          "List every emitted definition, roots and scalars included.",
          name,
        ),
      );
    }
  }
  for (const name of ordered) {
    if (!emitted.has(name)) {
      diagnostics.push(
        fail(
          ["definitionOrder"],
          `definitionOrder names ${name}, which the subgraph does not emit.`,
          "Remove it, or emit the definition.",
          name,
        ),
      );
    }
  }

  return diagnostics;
}

function packageScalarIssues(
  scalar: Extract<SubgraphScalarReferenceDefinition, { definition: unknown }>,
  index: number,
  declared: ReadonlySet<string>,
  fail: Fail,
): readonly DefinitionDiagnostic[] {
  const rebuild = "Rebuild the package with a matching compiler.";
  if (
    !isGraphQLName(scalar.name) ||
    isReferenceableScalarName(scalar.name) ||
    declared.has(scalar.name)
  ) {
    return [
      fail(
        ["scalars", index, "name"],
        `${String(scalar.name)} cannot name a package scalar: it is not a GraphQL name, or a catalog scalar, GraphQL built-in, or other package scalar has it.`,
        "Rename the scalar passed to defineScalar.",
        String(scalar.name),
      ),
    ];
  }
  const issues: DefinitionDiagnostic[] = [];
  if (scalar.implementation !== `package#${scalar.name}`) {
    issues.push(
      fail(
        ["scalars", index, "implementation"],
        `${scalar.name} names an implementation it does not match.`,
        rebuild,
        scalar.implementation,
      ),
    );
  }
  if (scalar.graphQLProfile !== "declared-coercion-v1") {
    issues.push(
      fail(
        ["scalars", index, "graphQLProfile"],
        `A package scalar is served with its own coercion.`,
        rebuild,
        String(scalar.graphQLProfile),
      ),
    );
  }
  for (const issue of scalarDefinitionIssues(scalar.definition, scalar.name, [
    "scalars",
    index,
    "definition",
  ])) {
    issues.push(fail([...issue.path], issue.message, rebuild, issue.received));
  }
  return issues;
}

function checkCompat(
  definition: Partial<SubgraphDefinition>,
  fail: Fail,
): readonly DefinitionDiagnostic[] {
  const compat = definition as Extract<
    SubgraphDefinition,
    { schemaKind: "graphql-ast-compat" }
  >;
  const diagnostics: DefinitionDiagnostic[] = [];

  if (
    compat.hasSubscriptions !== null &&
    typeof compat.hasSubscriptions !== "boolean"
  ) {
    diagnostics.push(
      fail(
        ["hasSubscriptions"],
        "A compatibility subgraph records true, false, or null.",
        "Rebuild the package with a matching compiler.",
        String(compat.hasSubscriptions),
      ),
    );
  }
  if (compat.access !== "manual") {
    diagnostics.push(
      fail(
        ["access"],
        "A compatibility subgraph's access marker is manual.",
        "Rebuild the package with a matching compiler.",
        String(compat.access),
      ),
    );
  }
  if (
    compat.document === null ||
    typeof compat.document !== "object" ||
    (compat.document as { kind?: unknown }).kind !== "Document"
  ) {
    diagnostics.push(
      fail(
        ["document"],
        "A compatibility subgraph carries a GraphQL document.",
        "Rebuild the package with a matching compiler.",
      ),
    );
  }
  if (!Array.isArray(compat.resolverCoordinates)) {
    return [
      ...diagnostics,
      fail(
        ["resolverCoordinates"],
        "A compatibility subgraph lists the coordinates its resolver map fills.",
        "Rebuild the package with a matching compiler.",
      ),
    ];
  }

  const seen = new Set<string>();
  compat.resolverCoordinates.forEach(
    (coordinate: ResolverCoordinateDefinition, index: number) => {
      const key = `${coordinate.typeName}.${coordinate.fieldName ?? ""}:${coordinate.resolverKind}`;
      if (seen.has(key)) {
        diagnostics.push(
          fail(
            ["resolverCoordinates", index],
            `${key} is listed twice.`,
            "List each coordinate once.",
            key,
          ),
        );
      }
      seen.add(key);
    },
  );

  return diagnostics;
}
