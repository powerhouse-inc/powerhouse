import type { DocumentScalarReferenceDefinition } from "@powerhousedao/shared/document-model";
import type { ScalarBinding } from "./types.js";

/**
 * The package scalars a compiled module declares, for the GraphQL host. A
 * module's definition carries each package scalar's wire definition, which is
 * enough to declare it. Coercing a value needs the binding, and a binding holds
 * functions, so it cannot live on the definition. It lives here, keyed by the
 * module, in one registry shared by every copy of this package in the process,
 * because a package compiles its models with its own copy and the host reads
 * them with another.
 */
const REGISTRY_KEY = Symbol.for("powerhouse.document-model.package-scalars.v1");

const globalRegistry = globalThis as unknown as {
  [REGISTRY_KEY]?: WeakMap<object, readonly ScalarBinding[]>;
};

const registry: WeakMap<object, readonly ScalarBinding[]> = (globalRegistry[
  REGISTRY_KEY
] ??= new WeakMap<object, readonly ScalarBinding[]>());

export function recordPackageScalars(
  module: object,
  scalars: readonly ScalarBinding[],
): void {
  if (scalars.length > 0) registry.set(module, Object.freeze([...scalars]));
}

/** The bindings of the package scalars `module` declares, in its order. */
export function packageScalarsOf(module: unknown): readonly ScalarBinding[] {
  return module !== null && typeof module === "object"
    ? (registry.get(module) ?? [])
    : [];
}

/** The names of the package scalars a specification declares, in its order. */
export function packageScalarNames(specification: {
  readonly scalars: readonly DocumentScalarReferenceDefinition[];
}): readonly string[] {
  return specification.scalars.flatMap((scalar) =>
    "definition" in scalar ? [scalar.name] : [],
  );
}
