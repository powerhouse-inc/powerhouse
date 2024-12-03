import { z } from "zod";

export const dateValidator = z.coerce.date();

export const numberValidator = z.number();

export function makeUniqueStringValidator(
  stringsToCheck: string[],
  message?: string,
) {
  return z.string().refine((s) => !stringsToCheck.includes(s), {
    message: message ?? "Item already exists",
  });
}

export function makeStringExistsValidator(
  stringsToCheck: string[],
  message?: string,
) {
  return z.string().refine((s) => stringsToCheck.includes(s), {
    message: message ?? "Item does not exist exist",
  });
}

export function makeStringEqualsValidator(
  stringToCheck: string,
  message?: string,
) {
  return z.string().refine((s) => s === stringToCheck, {
    message: message ?? "String does not match",
  });
}

function hasValueInObject(obj: any, searchValue: string): boolean {
  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.some((item) => hasValueInObject(item, searchValue));
  }

  // Handle objects
  if (obj && typeof obj === "object") {
    return Object.values(obj as Record<string, any>).some((value) =>
      hasValueInObject(value, searchValue),
    );
  }

  // Handle primitives
  return obj === searchValue;
}

export function findDependentItems(state: Record<string, any>, itemId: string) {
  const results: Record<string, any[]> = {};
  for (const [key, value] of Object.entries(state)) {
    if (!Array.isArray(value)) continue;
    const dependentItems = value.filter((a) => hasValueInObject(a, itemId));
    if (dependentItems.length > 0) {
      results[key] = dependentItems;
    }
  }
  return results;
}
