/**
 * Extract type names from a GraphQL schema.
 * Finds all type, enum, union, interface, and input definitions.
 */
export function extractTypeNames(schema: string): string[] {
  const found = schema.match(/(type|enum|union|interface|input)\s+(\w+)\s/g);
  if (!found) return [];
  return found.map((f) =>
    f
      .replaceAll("type ", "")
      .replaceAll("enum ", "")
      .replaceAll("union ", "")
      .replaceAll("interface ", "")
      .replaceAll("input ", "")
      .trim(),
  );
}

/**
 * Apply type prefixes to GraphQL schema to namespace types and avoid collisions.
 */
export function applyGraphQLTypePrefixes(
  schema: string,
  prefix: string,
  externalTypeNames: string[] = [],
): string {
  if (!schema || !schema.trim()) {
    return schema;
  }

  let processedSchema = schema;

  // Find types defined in this schema
  const localTypeNames = extractTypeNames(schema);

  // Combine with external type names (remove duplicates)
  const allTypeNames = [...new Set([...localTypeNames, ...externalTypeNames])];

  if (allTypeNames.length === 0) {
    return schema;
  }

  allTypeNames.forEach((typeName) => {
    const typeRegex = new RegExp(
      // Match type references in various GraphQL contexts
      `(?<![_A-Za-z0-9])(${typeName})(?![_A-Za-z0-9])|` +
        `\\[(${typeName})\\]|` +
        `\\[(${typeName})!\\]|` +
        `\\[(${typeName})\\]!|` +
        `\\[(${typeName})!\\]!`,
      "g",
    );

    processedSchema = processedSchema.replace(
      typeRegex,
      (
        match: string,
        p1: string,
        p2: string,
        p3: string,
        p4: string,
        p5: string,
      ) => {
        if (match.startsWith("[")) {
          const captured = p2 || p3 || p4 || p5;
          return match.replace(captured, `${prefix}_${captured}`);
        }
        // Basic type reference
        return `${prefix}_${p1}`;
      },
    );
  });

  return processedSchema;
}
