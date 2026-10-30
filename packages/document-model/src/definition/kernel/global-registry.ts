export function getGlobalRegistry<T extends object>(
  key: string,
  create: () => T,
): T {
  const registries = globalThis as { [key: symbol]: T | undefined };
  return (registries[Symbol.for(key)] ??= create());
}
