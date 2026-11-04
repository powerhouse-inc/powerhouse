import type {
  DefinitionExample,
  DocumentModelDefinition,
  DocumentModelSpecificationDefinition,
  NamedGraphQLTypeDefinition,
  StateDefinition,
} from "@powerhousedao/shared/document-model";

const byName = (
  a: NamedGraphQLTypeDefinition,
  b: NamedGraphQLTypeDefinition,
) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

export function sortTypes(
  definition: DocumentModelDefinition,
): DocumentModelDefinition {
  return {
    ...definition,
    specifications: definition.specifications.map((specification) => ({
      ...specification,
      types: [...specification.types].sort(byName),
    })),
  };
}

const example = ({ id: _id, key: _key, ...rest }: DefinitionExample) => rest;

function state({ materialized: _materialized, ...rest }: StateDefinition) {
  return { ...rest, examples: rest.examples.map(example) };
}

function specification({
  graphQLCompatibility: _graphQLCompatibility,
  ...rest
}: DocumentModelSpecificationDefinition) {
  return {
    ...rest,
    state: { global: state(rest.state.global), local: state(rest.state.local) },
    modules: rest.modules.map(({ id: _id, name: _name, ...module }) => ({
      ...module,
      operations: module.operations.map(
        ({ id: _operationId, name: _operationName, ...operation }) => ({
          ...operation,
          errors: operation.errors.map(({ id: _errorId, ...error }) => error),
          examples: operation.examples.map(example),
        }),
      ),
    })),
  };
}

export function identityFree(definition: DocumentModelDefinition) {
  const { compatibility: _compatibility, ...rest } = sortTypes(definition);
  return { ...rest, specifications: rest.specifications.map(specification) };
}
