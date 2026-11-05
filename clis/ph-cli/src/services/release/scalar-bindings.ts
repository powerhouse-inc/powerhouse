import type { ScalarBinding } from "./approval.js";

/** What a binding reads of an artifact: the version it serves and the scalars each version uses. */
type ServedArtifact = {
  readonly version: number;
  readonly definition: {
    readonly specifications: readonly {
      readonly version: number;
      readonly scalars: readonly {
        readonly name: string;
        readonly implementation: string;
      }[];
    }[];
  };
};

/** The package's name and version, as its package.json gives them. */
export type PackageIdentity = {
  readonly name: string | undefined;
  readonly version: string | undefined;
};

/**
 * The scalars the served versions use, by name: a catalog scalar comes with
 * the installed document-model, at `catalogVersion`, a package scalar with
 * this package.
 */
export function scalarBindings(
  artifacts: readonly ServedArtifact[],
  identity: PackageIdentity,
  catalogVersion: string | null,
): ScalarBinding[] {
  const bindings = new Map<string, ScalarBinding>();
  for (const artifact of artifacts) {
    const served = artifact.definition.specifications.find(
      ({ version }) => version === artifact.version,
    );
    for (const { name, implementation } of served?.scalars ?? []) {
      bindings.set(
        name,
        implementation.startsWith("powerhouse.catalog#")
          ? {
              scalar: name,
              packageName: "document-model",
              version: catalogVersion,
            }
          : {
              scalar: name,
              packageName: identity.name ?? "",
              version: identity.version ?? null,
            },
      );
    }
  }
  return [...bindings.values()].sort((left, right) =>
    left.scalar < right.scalar ? -1 : left.scalar > right.scalar ? 1 : 0,
  );
}
