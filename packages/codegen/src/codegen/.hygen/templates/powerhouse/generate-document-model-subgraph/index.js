// @ts-check
const { paramCase, pascalCase, camelCase } = require("change-case");

/**
 * Extract type names from a GraphQL schema.
 * @param {string} schema - GraphQL schema string
 * @returns {string[]} Array of type names
 */
function extractTypeNames(schema) {
  const found = schema.match(/(type|enum|union|interface|input)\s+(\w+)\s/g);
  if (!found) return [];
  return found.map((f) =>
    f
      .replaceAll("type ", "")
      .replaceAll("enum ", "")
      .replaceAll("union ", "")
      .replaceAll("interface ", "")
      .replaceAll("input ", "")
      .trim()
  );
}

/**
 * Apply type prefixes to GraphQL schema to namespace types and avoid collisions.
 * Inlined from @powerhousedao/common/utils to avoid ES module import issues.
 * @param {string} schema - GraphQL schema string
 * @param {string} prefix - Prefix to apply to type names
 * @param {string[]} externalTypeNames - Type names from other schemas to also prefix
 * @returns {string} Schema with prefixed types
 */
function applyGraphQLTypePrefixes(schema, prefix, externalTypeNames = []) {
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
      (match, p1, p2, p3, p4, p5) => {
        if (match.startsWith("[")) {
          return match.replace(
            p2 || p3 || p4 || p5,
            `${prefix}_${p2 || p3 || p4 || p5}`,
          );
        }
        // Basic type reference
        return `${prefix}_${p1}`;
      },
    );
  });

  return processedSchema;
}

module.exports = {
  params: ({ args }) => {
    const documentModel = JSON.parse(args.documentModel);
    const latestSpec =
      documentModel.specifications[documentModel.specifications.length - 1];
    const documentType = documentModel.name;
    const pascalCaseDocumentType = pascalCase(documentType);
    const camelCaseDocumentType = camelCase(documentType);
    const phDocumentTypeName = `${pascalCaseDocumentType}Document`;
    const documentTypeVariableName = `${camelCaseDocumentType}DocumentType`;
    const packageName = args.packageName;
    const paramCaseDocumentType = paramCase(documentType);
    const documentModelDir = `${packageName}/document-models/${paramCaseDocumentType}`;

    const stateSchema = latestSpec.state.global.schema;
    const stateTypeNames = extractTypeNames(stateSchema);

    return {
      phDocumentTypeName,
      documentTypeVariableName,
      pascalCaseDocumentType,
      camelCaseDocumentType,
      documentModelDir,
      rootDir: args.rootDir,
      subgraph: args.subgraph,
      documentTypeId: documentModel.id,
      documentType: documentModel.name,
      schema: applyGraphQLTypePrefixes(
        stateSchema,
        pascalCaseDocumentType
      ),
      modules: latestSpec.modules.map((m) => ({
        ...m,
        name: paramCase(m.name),
        operations: m.operations.map((op) => ({
          ...op,
          schema: applyGraphQLTypePrefixes(op.schema, pascalCaseDocumentType, stateTypeNames),
        })),
      })),
    };
  },
};
