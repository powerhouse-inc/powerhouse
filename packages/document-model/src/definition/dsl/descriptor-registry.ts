import { getGlobalRegistry } from "../kernel/global-registry.js";
import type { AnyFieldDescriptor, AnyTypeDescriptor } from "./types.js";

type Registry = {
  readonly fieldDescriptors: WeakSet<object>;
  readonly typeDescriptors: WeakSet<object>;
  readonly scalarFactories: WeakSet<object>;
  readonly referenceResolvers: WeakMap<object, () => AnyTypeDescriptor>;
};

const registry = getGlobalRegistry<Registry>(
  "powerhouse.document-model.descriptors.v1",
  () => ({
    fieldDescriptors: new WeakSet<object>(),
    typeDescriptors: new WeakSet<object>(),
    scalarFactories: new WeakSet<object>(),
    referenceResolvers: new WeakMap<object, () => AnyTypeDescriptor>(),
  }),
);

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
