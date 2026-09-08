import type {
  DirectiveUseDefinitionV1,
  FieldDefinitionV1,
  InputFieldDefinitionV1,
  JsonValue,
  NamedGraphQLTypeDefinitionV1,
  TypeReferenceDefinitionV1,
} from "@powerhousedao/shared/document-model";
import { failDefinition } from "./diagnostics.js";
import { isFieldDescriptor, isTypeDescriptor } from "./descriptor-registry.js";
import {
  resolveReferenceTarget,
  toFieldDefinition,
  toInputFieldDefinition,
} from "./field.js";
import type {
  AnyComputedFieldDescriptor,
  AnyFieldDescriptor,
  AnyTypeDescriptor,
  EnumDescriptor,
  InputDescriptor,
  InterfaceDescriptor,
  ListDescriptor,
  ObjectDescriptor,
  ObjectFields,
  ReferenceDescriptor,
  UnionDescriptor,
} from "./types.js";

export type DescriptorRoot = AnyTypeDescriptor | AnyFieldDescriptor;

export type PositionedDescriptorRoot =
  | {
      readonly descriptor: AnyTypeDescriptor;
      readonly position: "type";
    }
  | {
      readonly descriptor: AnyFieldDescriptor;
      readonly position: "input" | "output";
    };

function descriptionLine(description: string | null, indent = ""): string {
  return description === null
    ? ""
    : `${indent}${JSON.stringify(description)}\n`;
}

function printValue(value: JsonValue): string {
  if (value === null || typeof value === "boolean") return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(printValue).join(", ")}]`;
  return `{ ${Object.entries(value)
    .map(([key, item]) => `${key}: ${printValue(item)}`)
    .join(", ")} }`;
}

function printDirectives(
  directives: readonly DirectiveUseDefinitionV1[] | undefined,
): string {
  if (!directives || directives.length === 0) return "";
  return directives
    .map((directive) => {
      const args = directive.arguments.length
        ? `(${directive.arguments
            .map(
              (argument) => `${argument.name}: ${printValue(argument.value)}`,
            )
            .join(", ")})`
        : "";
      return ` @${directive.name}${args}`;
    })
    .join("");
}

function printDeprecated(deprecated: string | null): string {
  return deprecated === null
    ? ""
    : ` @deprecated(reason: ${JSON.stringify(deprecated)})`;
}

export function printTypeReference(type: TypeReferenceDefinitionV1): string {
  const base =
    type.kind === "list" ? `[${printTypeReference(type.item)}]` : type.name;
  return type.required ? `${base}!` : base;
}

function printInputField(
  field: InputFieldDefinitionV1,
  indent: string,
): string {
  const defaultValue = Object.hasOwn(field, "defaultValue")
    ? ` = ${printValue(field.defaultValue as JsonValue)}`
    : "";
  return `${descriptionLine(field.description, indent)}${indent}${field.name}: ${printTypeReference(field.type)}${defaultValue}${printDeprecated(field.deprecated)}${printDirectives(field.directives)}`;
}

function printField(field: FieldDefinitionV1, indent: string): string {
  const args = field.args?.length
    ? `(${field.args.map((argument) => printInputField(argument, "")).join(", ")})`
    : "";
  return `${descriptionLine(field.description, indent)}${indent}${field.name}${args}: ${printTypeReference(field.type)}${printDeprecated(field.deprecated)}${printDirectives(field.directives)}`;
}

export function emptyTypePlaceholderName(
  ownerName: string | null,
  occupiedNames: ReadonlySet<string> = new Set(),
): string {
  const base = ownerName === null ? "_phEmpty" : `_phEmpty${ownerName}`;
  let candidate = base;
  let suffix = 2;
  while (occupiedNames.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export function emptyInterfacePlaceholderNames(
  definitions: readonly NamedGraphQLTypeDefinitionV1[],
): ReadonlyMap<string, string> {
  const placeholders = new Map<string, string>();
  const used = new Set<string>();
  for (const definition of definitions) {
    if (definition.kind !== "interface" || definition.fields.length !== 0) {
      continue;
    }
    const occupiedNames = new Set(used);
    for (const candidate of definitions) {
      if (
        (candidate.kind === "object" || candidate.kind === "interface") &&
        expandedInterfaceNames(candidate, definitions).includes(definition.name)
      ) {
        candidate.fields.forEach((field) => occupiedNames.add(field.name));
      }
    }
    const placeholder = emptyTypePlaceholderName(
      definition.name,
      occupiedNames,
    );
    placeholders.set(definition.name, placeholder);
    used.add(placeholder);
  }
  return placeholders;
}

export function expandedInterfaceNames(
  definition: NamedGraphQLTypeDefinitionV1,
  definitions: readonly NamedGraphQLTypeDefinitionV1[],
): readonly string[] {
  if (definition.kind !== "object" && definition.kind !== "interface") {
    return [];
  }
  const interfaces = new Map(
    definitions
      .filter((candidate) => candidate.kind === "interface")
      .map((candidate) => [candidate.name, candidate] as const),
  );
  const expanded: string[] = [];
  const seen = new Set<string>();
  const visit = (interfaceName: string): void => {
    if (seen.has(interfaceName)) return;
    seen.add(interfaceName);
    expanded.push(interfaceName);
    interfaces.get(interfaceName)?.implements?.forEach(visit);
  };
  definition.implements?.forEach(visit);
  return expanded;
}

function placeholderField(name: string): string {
  return `  ${name}: Boolean`;
}

function printNamedDefinitionWithEmptyInterfaces(
  definition: NamedGraphQLTypeDefinitionV1,
  emptyInterfaces: ReadonlyMap<string, string>,
  definitions: readonly NamedGraphQLTypeDefinitionV1[],
): string {
  const description = descriptionLine(definition.description);
  switch (definition.kind) {
    case "enum":
      return `${description}enum ${definition.name} {\n${definition.values
        .map(
          (value) =>
            `${descriptionLine(value.description, "  ")}  ${value.name}${printDeprecated(value.deprecated)}${printDirectives(value.directives)}`,
        )
        .join("\n")}\n}`;
    case "object": {
      const interfaceNames = expandedInterfaceNames(definition, definitions);
      const implemented = interfaceNames.length
        ? ` implements ${interfaceNames.join(" & ")}`
        : "";
      const fields = definition.fields.map((field) => printField(field, "  "));
      for (const interfaceName of interfaceNames) {
        const placeholder = emptyInterfaces.get(interfaceName);
        if (placeholder) fields.push(placeholderField(placeholder));
      }
      if (fields.length === 0) {
        fields.push(placeholderField(emptyTypePlaceholderName(null)));
      }
      return `${description}type ${definition.name}${implemented} {\n${fields.join("\n")}\n}`;
    }
    case "interface": {
      const interfaceNames = expandedInterfaceNames(definition, definitions);
      const implemented = interfaceNames.length
        ? ` implements ${interfaceNames.join(" & ")}`
        : "";
      const fields = definition.fields.map((field) => printField(field, "  "));
      for (const interfaceName of interfaceNames) {
        const placeholder = emptyInterfaces.get(interfaceName);
        if (placeholder) fields.push(placeholderField(placeholder));
      }
      if (definition.fields.length === 0) {
        fields.push(
          placeholderField(
            emptyInterfaces.get(definition.name) ??
              emptyTypePlaceholderName(definition.name),
          ),
        );
      }
      return `${description}interface ${definition.name}${implemented} {\n${fields.join("\n")}\n}`;
    }
    case "input": {
      const fields = definition.fields.map((field) =>
        printInputField(field, "  "),
      );
      if (fields.length === 0) {
        fields.push(placeholderField(emptyTypePlaceholderName(null)));
      }
      return `${description}input ${definition.name} {\n${fields.join("\n")}\n}`;
    }
    case "union":
      return `${description}union ${definition.name} = ${definition.members.join(" | ")}`;
  }
}

export function printNamedDefinition(
  definition: NamedGraphQLTypeDefinitionV1,
): string {
  return printNamedDefinitionWithEmptyInterfaces(definition, new Map(), [
    definition,
  ]);
}

function outputFieldDefinition(
  key: string,
  descriptor: ObjectDescriptor,
): FieldDefinitionV1 {
  const stored = (
    descriptor.fields as Partial<Record<string, AnyFieldDescriptor>>
  )[key];
  if (stored) return toFieldDefinition(key, stored);
  const computed = (
    descriptor.computed as Partial<Record<string, AnyComputedFieldDescriptor>>
  )[key];
  if (!computed) {
    return failDefinition({
      code: "PH-DEF-FIELD-INVALID",
      path: [descriptor.name as string, "fields", key],
      message: `Object member ${key} has no stored or computed descriptor.`,
      repair: "Recreate the object descriptor from an unmodified fields map.",
    });
  }
  return {
    key,
    name: key,
    description: computed.presentation.description,
    deprecated: computed.presentation.deprecated,
    args: Object.entries(computed.args as ObjectFields).map(([argKey, arg]) =>
      toInputFieldDefinition(argKey, arg),
    ),
    type: toFieldDefinition(key, computed.returns).type,
  };
}

export function toNamedDefinition(
  descriptor: AnyTypeDescriptor,
  options: { readonly inputUnknownKeys?: "preserve" | "reject" } = {},
): NamedGraphQLTypeDefinitionV1 {
  if (!isTypeDescriptor(descriptor)) {
    return failDefinition({
      code: "PH-DEF-REFERENCE-TARGET-INVALID",
      path: ["types"],
      message: "A named definition must come from a ph type descriptor.",
      repair:
        "Use a descriptor returned by ph.enum, ph.object, ph.input, ph.interface, or ph.union.",
    });
  }
  if (descriptor.name === null) {
    return failDefinition({
      code: "PH-DEF-ANONYMOUS-TYPE-UNRESOLVED",
      path: ["types"],
      message: "An anonymous input has no contextual GraphQL name.",
      repair:
        "Give the input an explicit name or finalize it as an operation input.",
    });
  }
  switch (descriptor.kind) {
    case "enum": {
      const value = descriptor as EnumDescriptor;
      return {
        kind: "enum",
        name: descriptor.name,
        description: descriptor.description,
        values: value.values.map((name) => ({
          name,
          description: null,
          deprecated: null,
        })),
      };
    }
    case "object": {
      const value = descriptor as ObjectDescriptor;
      return {
        kind: "object",
        name: descriptor.name,
        description: descriptor.description,
        ...(value.implements.length
          ? {
              implements: value.implements.map(
                (implemented) => implemented.name as string,
              ),
            }
          : {}),
        fields: value.memberOrder.map((key) =>
          outputFieldDefinition(key, value),
        ),
      };
    }
    case "interface": {
      const value = descriptor as InterfaceDescriptor;
      return {
        kind: "interface",
        name: descriptor.name,
        description: descriptor.description,
        fields: Object.entries(value.fields).map(([key, field]) =>
          toFieldDefinition(key, field),
        ),
      };
    }
    case "input": {
      const value = descriptor as InputDescriptor;
      return {
        kind: "input",
        name: descriptor.name,
        description: descriptor.description,
        unknownKeys: options.inputUnknownKeys ?? "preserve",
        fields: Object.entries(value.fields).map(([key, field]) =>
          toInputFieldDefinition(key, field),
        ),
      };
    }
    case "union": {
      const value = descriptor as UnionDescriptor;
      return {
        kind: "union",
        name: descriptor.name,
        description: descriptor.description,
        members: value.members.map((member) => member.name as string),
      };
    }
  }
}

export function collectPositionedNamedDefinitions(
  roots: readonly PositionedDescriptorRoot[],
  options: { readonly inputUnknownKeys?: "preserve" | "reject" } = {},
): readonly NamedGraphQLTypeDefinitionV1[] {
  const definitions: NamedGraphQLTypeDefinitionV1[] = [];
  const visited = new Set<AnyTypeDescriptor>();
  const names = new Map<string, AnyTypeDescriptor>();

  function visitField(
    descriptor: AnyFieldDescriptor,
    position: "input" | "output",
  ): void {
    if (!isFieldDescriptor(descriptor)) {
      failDefinition({
        code: "PH-DEF-FIELD-INVALID",
        path: ["types"],
        message: "A field position must contain a field-use descriptor.",
        repair: "Use a scalar factory, ph.list(...), or ph.ref(Type).",
      });
    }
    if (descriptor.kind === "list") {
      visitField((descriptor as ListDescriptor<any, any, any>).item, position);
      return;
    }
    if (descriptor.kind !== "ref") return;
    const target = resolveReferenceTarget(
      descriptor as ReferenceDescriptor<any, any, any>,
    );
    const valid =
      position === "input"
        ? target.kind === "input" || target.kind === "enum"
        : target.kind !== "input";
    if (!valid) {
      failDefinition({
        code: "PH-DEF-TYPE-POSITION-INVALID",
        path: [target.name ?? "<anonymous>"],
        message: `Type ${target.name ?? "<anonymous>"} cannot be used in an ${position} position.`,
        repair:
          position === "input"
            ? "Reference a ph.input or ph.enum type."
            : "Reference an output object, interface, enum, or union type.",
      });
    }
    visitType(target);
  }

  function visitFields(fields: ObjectFields, position: "input" | "output") {
    Object.values(fields).forEach((field) => visitField(field, position));
  }

  function visitType(descriptor: AnyTypeDescriptor): void {
    if (!isTypeDescriptor(descriptor)) {
      failDefinition({
        code: "PH-DEF-REFERENCE-TARGET-INVALID",
        path: ["types"],
        message: "A type position must contain a named type descriptor.",
        repair:
          "Use a descriptor returned by ph.enum, ph.object, ph.input, ph.interface, or ph.union.",
      });
    }
    if (visited.has(descriptor)) return;
    if (descriptor.name === null) {
      toNamedDefinition(descriptor, options);
      return;
    }
    const collision = names.get(descriptor.name);
    if (collision && collision !== descriptor) {
      failDefinition({
        code: "PH-DEF-GRAPHQL-NAME-DUPLICATE",
        path: ["types", descriptor.name],
        message: `GraphQL type name ${descriptor.name} belongs to more than one descriptor.`,
        repair: "Rename one type or reuse the same descriptor token.",
      });
    }
    names.set(descriptor.name, descriptor);
    visited.add(descriptor);
    definitions.push(toNamedDefinition(descriptor, options));

    switch (descriptor.kind) {
      case "enum":
        return;
      case "input":
        visitFields((descriptor as InputDescriptor).fields, "input");
        return;
      case "interface":
        visitFields((descriptor as InterfaceDescriptor).fields, "output");
        return;
      case "union":
        (descriptor as UnionDescriptor).members.forEach(visitType);
        return;
      case "object": {
        const object = descriptor as ObjectDescriptor;
        const storedFields = object.fields as Partial<
          Record<string, AnyFieldDescriptor>
        >;
        const computedFields = object.computed as Partial<
          Record<string, AnyComputedFieldDescriptor>
        >;
        object.implements.forEach(visitType);
        for (const key of object.memberOrder) {
          const stored = storedFields[key];
          if (stored) visitField(stored, "output");
          const computed = computedFields[key];
          if (computed) {
            visitFields(computed.args, "input");
            visitField(computed.returns, "output");
          }
        }
      }
    }
  }

  for (const root of roots) {
    if (root.position === "type") visitType(root.descriptor);
    else visitField(root.descriptor, root.position);
  }
  return definitions;
}

export function collectNamedDefinitions(
  roots: readonly DescriptorRoot[],
  options: { readonly inputUnknownKeys?: "preserve" | "reject" } = {},
): readonly NamedGraphQLTypeDefinitionV1[] {
  return collectPositionedNamedDefinitions(
    roots.map((descriptor) => {
      if (isFieldDescriptor(descriptor)) {
        return { descriptor, position: "output" as const };
      }
      if (isTypeDescriptor(descriptor)) {
        return { descriptor, position: "type" as const };
      }
      return failDefinition({
        code: "PH-DEF-FIELD-INVALID",
        path: ["types"],
        message: "A schema root must contain an opaque ph descriptor.",
        repair: "Use a descriptor returned by a ph factory.",
      });
    }),
    options,
  );
}

export function printDescriptorSchema(
  roots: readonly DescriptorRoot[],
): string {
  const definitions = collectNamedDefinitions(roots);
  if (definitions.length === 0) return "";
  const emptyInterfaces = emptyInterfacePlaceholderNames(definitions);
  return `${definitions
    .map((definition) =>
      printNamedDefinitionWithEmptyInterfaces(
        definition,
        emptyInterfaces,
        definitions,
      ),
    )
    .join("\n\n")}\n`;
}
