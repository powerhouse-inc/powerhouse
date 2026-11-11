import type {
  DefinitionPath,
  DirectiveUseDefinition,
  FieldDefinition,
  InputFieldDefinition,
  NamedGraphQLTypeDefinition,
} from "@powerhousedao/shared/document-model";

/**
 * The directives Apollo Federation 1 and 2 define. Entities and federation
 * composition are out of scope for typed subgraphs, so their directives are
 * refused rather than projected into a schema that composes differently.
 */
export const FEDERATION_DIRECTIVES: ReadonlySet<string> = new Set([
  "key",
  "extends",
  "external",
  "requires",
  "provides",
  "shareable",
  "inaccessible",
  "override",
  "link",
  "tag",
  "composeDirective",
  "interfaceObject",
  "authenticated",
  "requiresScopes",
  "policy",
  "context",
  "fromContext",
  "cost",
  "listSize",
]);

/**
 * The `Query` fields Apollo's `buildSubgraphSchema` adds to every subgraph,
 * so an entry may not declare them.
 */
export const FEDERATION_QUERY_FIELDS: ReadonlySet<string> = new Set([
  "_service",
  "_entities",
]);

export type FederationDirectiveUse = {
  readonly name: string;
  readonly path: DefinitionPath;
};

function refused(
  directives: readonly DirectiveUseDefinition[] | undefined,
  path: DefinitionPath,
): FederationDirectiveUse[] {
  return (directives ?? []).flatMap((directive, index) =>
    FEDERATION_DIRECTIVES.has(directive.name)
      ? [{ name: directive.name, path: [...path, "directives", index] }]
      : [],
  );
}

function inArguments(
  args: readonly InputFieldDefinition[] | undefined,
  path: DefinitionPath,
): FederationDirectiveUse[] {
  return (args ?? []).flatMap((argument) =>
    refused(argument.directives, [...path, "args", argument.name]),
  );
}

function inFields(
  fields: readonly (FieldDefinition | InputFieldDefinition)[],
  path: DefinitionPath,
): FederationDirectiveUse[] {
  return fields.flatMap((field) => {
    const fieldPath = [...path, "fields", field.name];
    return [
      ...refused(field.directives, fieldPath),
      ...("args" in field ? inArguments(field.args, fieldPath) : []),
    ];
  });
}

export function federationDirectiveUses(
  types: readonly NamedGraphQLTypeDefinition[],
): readonly FederationDirectiveUse[] {
  return types.flatMap((type) => {
    const path = ["types", type.name];
    switch (type.kind) {
      case "enum":
        return type.values.flatMap((value) =>
          refused(value.directives, [...path, "values", value.name]),
        );
      case "object":
      case "interface":
      case "input":
        return inFields(type.fields, path);
      case "union":
        return [];
    }
  });
}
