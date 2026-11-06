import type {
  FieldDefinition,
  InputFieldDefinition,
  NamedGraphQLTypeDefinition,
  TypeReferenceDefinition,
} from "@powerhousedao/shared/document-model";
import { scalarCatalog } from "../../../scalars/catalog.js";
import type { ScalarDefinition } from "../../../scalars/types.js";
import { ph } from "../../dsl/field.js";
import { createScalarField } from "../../dsl/field-options.js";
import { builtInScalarFactories } from "../../dsl/scalar-fields.js";
import { definitionEquals } from "../../kernel/graphql-ast.js";
import type {
  AnyFieldDescriptor,
  AnyTypeDescriptor,
  ObjectDescriptor,
  ObjectFields,
} from "../../dsl/types.js";

export function storedStateDescriptor(
  typesByName: ReadonlyMap<string, NamedGraphQLTypeDefinition>,
  root: string,
  scalars: readonly ScalarDefinition[],
): AnyTypeDescriptor | undefined {
  const scalarsByName = new Map<string, ScalarDefinition>(
    [...scalarCatalog, ...scalars].map((scalar) => [scalar.name, scalar]),
  );
  const built = new Map<string, AnyTypeDescriptor>();

  const fieldUse = (
    type: TypeReferenceDefinition,
    field?: FieldDefinition | InputFieldDefinition,
  ): AnyFieldDescriptor => {
    const options = {
      required: type.required,
      ...(field !== undefined &&
        "defaultValue" in field &&
        field.defaultValue !== undefined && {
          defaultValue: field.defaultValue,
        }),
    };
    switch (type.kind) {
      case "list":
        return ph.list(fieldUse(type.item), options);
      case "named":
        return ph.ref(() => named(type.name), options);
      case "scalar": {
        const equals = field === undefined ? null : definitionEquals(field);
        const scalarOptions = {
          ...options,
          ...(equals !== null && { equals }),
        };
        if (Object.hasOwn(builtInScalarFactories, type.name)) {
          return builtInScalarFactories[
            type.name as keyof typeof builtInScalarFactories
          ](scalarOptions);
        }
        const definition = scalarsByName.get(type.name);
        if (definition === undefined) {
          throw new TypeError(`Unknown scalar ${type.name}.`);
        }
        return createScalarField(
          definition.name,
          definition.schema,
          scalarOptions,
          definition,
        );
      }
    }
  };

  const fields = (
    members: readonly (FieldDefinition | InputFieldDefinition)[],
  ): ObjectFields =>
    Object.fromEntries(
      members.map((member) => [member.name, fieldUse(member.type, member)]),
    );

  const named = (name: string): AnyTypeDescriptor => {
    const existing = built.get(name);
    if (existing !== undefined) return existing;
    const type = typesByName.get(name);
    if (type === undefined) throw new TypeError(`Unknown type ${name}.`);
    const descriptor = describe(type);
    built.set(name, descriptor);
    return descriptor;
  };

  const describe = (type: NamedGraphQLTypeDefinition): AnyTypeDescriptor => {
    switch (type.kind) {
      case "enum":
        return ph.enum(type.name, {
          values: type.values.map(({ name }) => name) as [string, ...string[]],
        });
      case "object":
        return ph.object(type.name, { fields: fields(type.fields) });
      case "interface":
        return ph.interface(type.name, { fields: fields(type.fields) });
      case "input":
        return ph.input(type.name, { fields: fields(type.fields) });
      case "union":
        return ph.union(type.name, {
          members: type.members.map(
            (member) => named(member) as ObjectDescriptor,
          ) as [ObjectDescriptor, ...ObjectDescriptor[]],
        });
    }
  };

  const reachable = (name: string, seen: Set<string>): void => {
    if (seen.has(name)) return;
    seen.add(name);
    named(name);
    const type = typesByName.get(name);
    const references = (reference: TypeReferenceDefinition): string[] =>
      reference.kind === "list"
        ? references(reference.item)
        : reference.kind === "named"
          ? [reference.name]
          : [];
    const next =
      type === undefined
        ? []
        : type.kind === "union"
          ? type.members
          : type.kind === "enum"
            ? []
            : type.fields.flatMap((field) => references(field.type));
    for (const member of next) reachable(member, seen);
  };

  try {
    reachable(root, new Set());
    return named(root);
  } catch {
    return undefined;
  }
}
