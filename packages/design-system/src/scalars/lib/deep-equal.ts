export function deepEqual(
  a: unknown,
  b: unknown,
  visited = new Map(),
): boolean {
  if (a === b) {
    return true;
  }

  if (a === null || b === null || a === undefined || b === undefined) {
    return false;
  }

  if (typeof a !== typeof b) {
    return false;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (visited.get(a) === b) {
      return true; // Same circular reference detected
    }
    visited.set(a, b);
    return (
      a.length === b.length &&
      a.every((value, index) => deepEqual(value, b[index], visited))
    );
  }

  if (
    typeof a === "object" &&
    typeof b === "object" &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  ) {
    if (visited.get(a) === b) {
      return true; // Same circular reference detected
    }
    visited.set(a, b);
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    return (
      aKeys.length === bKeys.length &&
      aKeys.every((key) => {
        return (
          key in b &&
          deepEqual(
            (a as Record<string, unknown>)[key],
            (b as Record<string, unknown>)[key],
            visited,
          )
        );
      })
    );
  }

  return false;
}
