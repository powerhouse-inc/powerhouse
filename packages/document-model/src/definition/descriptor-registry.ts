import type { AnyFieldDescriptor, AnyTypeDescriptor } from "./types.js";

/**
 * What `ph` created, recorded where a second copy of the compiler can read it.
 *
 * A descriptor is plain data, but "did `ph` make this" and "what does this
 * reference point at" are answered by object identity, so the answers live
 * outside the descriptor. One process routinely holds two copies of this
 * package: a code-first subgraph reaches `ph` through its own package bundle
 * and `defineSubgraph` through the host's — the host is deliberately never
 * bundled, so that the class identity its loader checks stays single. With a
 * registry private to each copy the host's compiler would then answer "not a
 * descriptor" for every descriptor the package built, and a subgraph would
 * publish an empty schema with diagnostics nobody asked for.
 *
 * `materialize.ts` shares its compilation reports the same way and for the
 * same reason. The key is versioned: a future descriptor shape gets its own
 * registry rather than being read by a compiler that predates it.
 */
const REGISTRY_KEY = Symbol.for("powerhouse.document-model.descriptors.v1");

type Registry = {
  readonly fieldDescriptors: WeakSet<object>;
  readonly typeDescriptors: WeakSet<object>;
  readonly scalarFactories: WeakSet<object>;
  readonly referenceResolvers: WeakMap<object, () => AnyTypeDescriptor>;
};

const globalRegistry = globalThis as unknown as {
  [REGISTRY_KEY]?: Registry;
};

const registry: Registry = (globalRegistry[REGISTRY_KEY] ??= {
  fieldDescriptors: new WeakSet<object>(),
  typeDescriptors: new WeakSet<object>(),
  scalarFactories: new WeakSet<object>(),
  referenceResolvers: new WeakMap<object, () => AnyTypeDescriptor>(),
});

export function registerFieldDescriptor<T extends AnyFieldDescriptor>(
  descriptor: T,
): T {
  registry.fieldDescriptors.add(descriptor);
  return descriptor;
}

export function registerTypeDescriptor<T extends AnyTypeDescriptor>(
  descriptor: T,
): T {
  registry.typeDescriptors.add(descriptor);
  return descriptor;
}

export function registerScalarFactory<T extends object>(factory: T): T {
  registry.scalarFactories.add(factory);
  return factory;
}

export function isFieldDescriptor(value: unknown): value is AnyFieldDescriptor {
  return (
    value !== null &&
    typeof value === "object" &&
    registry.fieldDescriptors.has(value)
  );
}

export function isTypeDescriptor(value: unknown): value is AnyTypeDescriptor {
  return (
    value !== null &&
    typeof value === "object" &&
    registry.typeDescriptors.has(value)
  );
}

export function isScalarFactory(value: unknown): boolean {
  return typeof value === "function" && registry.scalarFactories.has(value);
}

export function registerReference<T extends AnyFieldDescriptor>(
  descriptor: T,
  resolve: () => AnyTypeDescriptor,
): T {
  registry.referenceResolvers.set(descriptor, resolve);
  return descriptor;
}

export function referenceResolver(
  descriptor: object,
): (() => AnyTypeDescriptor) | undefined {
  return registry.referenceResolvers.get(descriptor);
}
