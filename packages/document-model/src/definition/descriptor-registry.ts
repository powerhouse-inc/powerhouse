import type { AnyFieldDescriptor, AnyTypeDescriptor } from "./types.js";

const fieldDescriptors = new WeakSet<object>();
const typeDescriptors = new WeakSet<object>();

export function registerFieldDescriptor<T extends AnyFieldDescriptor>(
  descriptor: T,
): T {
  fieldDescriptors.add(descriptor);
  return descriptor;
}

export function registerTypeDescriptor<T extends AnyTypeDescriptor>(
  descriptor: T,
): T {
  typeDescriptors.add(descriptor);
  return descriptor;
}

export function isFieldDescriptor(value: unknown): value is AnyFieldDescriptor {
  return (
    value !== null && typeof value === "object" && fieldDescriptors.has(value)
  );
}

export function isTypeDescriptor(value: unknown): value is AnyTypeDescriptor {
  return (
    value !== null && typeof value === "object" && typeDescriptors.has(value)
  );
}
