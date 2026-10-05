import type {
  DocumentModelSpecificationDefinition,
  InputTypeDefinition,
  NamedGraphQLTypeDefinition,
} from "@powerhousedao/shared/document-model";
import { camelCase } from "change-case";
import { printSchemaSegment } from "document-model";
import type { ModelProjection } from "./model-schema-templates.js";
import {
  initialStateInputTypes,
  namespaceTypes,
  type StructuredModel,
} from "./structured-projection.js";

/** Reads the template inputs out of a code-first model's structured definition. */
export function structuredModelProjection(
  model: StructuredModel,
  documentName: string,
): ModelProjection {
  const { specification, segments, packageScalars } = model;
  const namespaced = (types: readonly NamedGraphQLTypeDefinition[]) =>
    printSchemaSegment(namespaceTypes(types, documentName, packageScalars));

  const localRoot = specification.state.local.root;
  const localStateTypeName =
    localRoot === null ||
    !segments.local.some(
      (type) => type.kind === "object" && type.name === localRoot.name,
    )
      ? null
      : `${documentName}_${localRoot.name}`;

  return {
    documentName,
    operations: mutationOperations(specification).map(({ name, input }) => ({
      camelName: camelCase(name),
      inputTypeName: `${documentName}_${input.name}`,
    })),
    modules: specification.modules.flatMap((module) => {
      const types = module.operations.flatMap(
        (operation) =>
          segments.operations.get(`${module.key}/${operation.key}`) ?? [],
      );
      return types.length === 0
        ? []
        : [{ name: module.name, sdl: namespaced(types) }];
    }),
    // Input types declared in the global state segment rather than by an
    // operation. The stored-SDL path finds the same types by regex over the
    // global state schema.
    stateInputTypes: namespaced(
      segments.global.filter((type) => type.kind === "input"),
    ),
    globalStateTypeName: `${documentName}_${specification.state.global.root.name}`,
    localStateTypeName,
    initialState: structuredInitialState(model, documentName, namespaced),
  };
}

/**
 * Returns the operations with a stored name and an input type, which are the
 * ones that get a mutation. The stored-SDL path's `hasValidSchema(op.schema)`
 * check selects the same operations.
 */
function mutationOperations(
  specification: DocumentModelSpecificationDefinition,
): readonly { readonly name: string; readonly input: InputTypeDefinition }[] {
  return specification.modules.flatMap((module) =>
    module.operations.flatMap((operation) =>
      operation.name === null || operation.input === null
        ? []
        : [{ name: operation.name, input: operation.input }],
    ),
  );
}

/**
 * Every type name the specification declares, including operation inputs. A
 * state object gets a generated `XInput` only when no declared type has that
 * name, so an operation's named input is never defined twice.
 */
function declaredTypeNames(
  specification: DocumentModelSpecificationDefinition,
): ReadonlySet<string> {
  const names = new Set(specification.types.map((type) => type.name));
  for (const module of specification.modules) {
    for (const operation of module.operations) {
      if (operation.input !== null) names.add(operation.input.name);
    }
  }
  return names;
}

/**
 * Builds the new API's initial-state input, with one input type per state
 * object and every field optional. A scope with no root, or no convertible
 * object, falls back to `JSONObject`, as the stored-SDL path does when it
 * cannot find a root type.
 */
function structuredInitialState(
  { specification, segments }: StructuredModel,
  documentName: string,
  namespaced: (types: readonly NamedGraphQLTypeDefinition[]) => string,
): ModelProjection["initialState"] {
  const declared = declaredTypeNames(specification);
  const inputTypes: string[] = [];
  const scopes = (["global", "local"] as const).map((name) => {
    const root = specification.state[name].root;
    const types = segments[name];
    if (root === null || types.length === 0) {
      return { name, type: "JSONObject" };
    }
    const inputs = initialStateInputTypes(types, declared);
    if (inputs.length === 0) return { name, type: "JSONObject" };
    inputTypes.push(namespaced(inputs));
    return { name, type: `${documentName}_${root.name}Input` };
  });
  return { inputTypes: inputTypes.join("\n\n"), scopes };
}

/**
 * Returns the stored operation names a code-first model's mutations are keyed
 * by. The host derives the mutation field and the action creator from
 * `camelCase(name)` for both authoring approaches, so this uses the stored name
 * rather than the operation key.
 */
export function structuredOperationNames(
  model: StructuredModel,
): readonly string[] {
  return mutationOperations(model.specification).map(({ name }) => name);
}
