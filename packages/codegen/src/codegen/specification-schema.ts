import { mergeTypeDefs } from "@graphql-tools/merge";
import type {
  DocumentSpecification,
  ModuleSpecification,
} from "@powerhousedao/shared/document-model";
import { documentModelScalars } from "document-model/scalars";
import { buildASTSchema, type GraphQLSchema } from "graphql";

function buildSchemasForModules(modules: ModuleSpecification[]) {
  const schemaStrings: string[] = [];
  for (const module of modules) {
    schemaStrings.push(`# ${module.name}`);
    const operationsSchemas = module.operations
      .map((operation) => operation.schema)
      .filter((schema) => schema !== null);
    schemaStrings.push(...operationsSchemas);
  }
  return schemaStrings;
}

export function buildGraphqlDocumentStringForSpecification(
  specification: DocumentSpecification,
) {
  const customScalarSchemas = documentModelScalars
    .map(({ name }) => `scalar ${name}`)
    .join("\n");
  const stateSchemas = Object.values(specification.state).map(
    (state) => state.schema,
  );
  const moduleSchemas = buildSchemasForModules(specification.modules);

  return [customScalarSchemas, ...stateSchemas, ...moduleSchemas]
    .filter(Boolean)
    .join("\n\n");
}

// Merges duplicate definitions and extensions the way graphql-codegen loads the schema for zod.ts.
export function buildSpecificationSchema(
  specification: DocumentSpecification,
): GraphQLSchema {
  return buildASTSchema(
    mergeTypeDefs([buildGraphqlDocumentStringForSpecification(specification)], {
      convertExtensions: true,
    }),
    { assumeValidSDL: true },
  );
}
