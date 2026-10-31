import type {
  DefinitionPath,
  EnumValueDefinition,
  FieldDefinition,
  InputFieldDefinition,
  NamedGraphQLTypeDefinition,
  TypeReferenceDefinition,
} from "@powerhousedao/shared/document-model";
import { getCatalogScalar } from "../../scalars/catalog.js";
import type { ScalarDefinition } from "../../scalars/types.js";
import { isTypeDescriptor } from "../dsl/descriptor-registry.js";
import { builtInScalarFactories } from "../dsl/scalar-fields.js";
import type {
  AnyFieldDescriptor,
  AnyTypeDescriptor,
  EnumDescriptor,
  InputDescriptor,
  InterfaceDescriptor,
  ListDescriptor,
  ObjectDescriptor,
  ObjectFields,
  ReferenceDescriptor,
  ScalarDescriptor,
  UnionDescriptor,
} from "../dsl/types.js";
import { resolveReference } from "../dsl/zod.js";
import type { DefinitionDiagnosticCollector } from "../kernel/diagnostic-collector.js";
import { DefinitionError, describeReceived } from "../kernel/diagnostics.js";
import { canonicalJson } from "../kernel/primitives.js";
import { printTypeReference } from "../kernel/printer.js";
import type { CompilerDiagnosticCode } from "./diagnostic-codes.js";
import {
  fieldDefault,
  inputDefaultCycle,
  inputDefaultProblem,
} from "./input-default.js";
import { type InputCycleField, nonNullInputCycles } from "./input-cycle.js";
import { interfaceConformanceProblems } from "./interface-conformance.js";

type Position = "input" | "output";

class WalkAbort extends Error {}

function directivesOf(
  field: AnyFieldDescriptor,
): Pick<FieldDefinition, "directives"> {
  const { directives } = field.presentation;
  return directives.length > 0 ? { directives } : {};
}

export class DescriptorWalk {
  readonly definitions: NamedGraphQLTypeDefinition[] = [];
  readonly catalogScalars = new Set<string>();
  readonly packageScalars = new Map<string, ScalarDefinition>();
  readonly #collector: DefinitionDiagnosticCollector<CompilerDiagnosticCode>;
  readonly #built = new Map<AnyTypeDescriptor, NamedGraphQLTypeDefinition>();
  readonly #visited = new Set<AnyTypeDescriptor>();
  readonly #claims = new Map<
    string,
    { readonly token: AnyTypeDescriptor; readonly path: DefinitionPath }
  >();

  constructor(
    collector: DefinitionDiagnosticCollector<CompilerDiagnosticCode>,
  ) {
    this.#collector = collector;
  }

  visitType(
    candidate: unknown,
    position: Position,
    path: DefinitionPath,
    options: { readonly emit?: boolean } = {},
  ): NamedGraphQLTypeDefinition | undefined {
    if (!isTypeDescriptor(candidate)) {
      this.#collector.add({
        code: "PH-DM-DECLARATION-INVALID",
        path,
        message:
          "A type position must hold a named type created by a ph builder.",
        expected: "a named type descriptor",
        received: describeReceived(candidate),
        repair:
          "Use a descriptor returned by ph.enum, ph.object, ph.input, ph.interface, or ph.union.",
      });
      return undefined;
    }
    if (this.#visited.has(candidate)) return this.#built.get(candidate);
    if (!this.#claimName(candidate, path)) return undefined;
    this.#visited.add(candidate);
    const definition = this.#attempt(() =>
      this.#namedDefinition(candidate, path),
    );
    if (definition === undefined) return undefined;
    this.#built.set(candidate, definition);
    if (options.emit !== false) this.definitions.push(definition);
    this.#visitChildren(candidate, position, path);
    return definition;
  }

  checkInputCycles(): void {
    const fieldPath = ({ owner, key }: InputCycleField): DefinitionPath => [
      ...(this.#claims.get(owner)?.path ?? []),
      "fields",
      key,
    ];
    for (const cycle of nonNullInputCycles(this.definitions)) {
      const [first, ...rest] = cycle.fields;
      const keys = cycle.fields.map(({ key }) => key).join(".");
      this.#collector.add({
        code: "PH-DM-INPUT-CYCLE",
        path: fieldPath(first),
        message: `Input ${cycle.input} contains itself through the non-null fields ${JSON.stringify(keys)}, so no finite value satisfies it.`,
        expected: "a nullable field or a list in every input cycle",
        received: cycle.fields
          .map(({ owner, key }) => `${owner}.${key}`)
          .join(" -> "),
        repair: "Make one field of the cycle nullable, or wrap it in ph.list.",
        ...(rest.length > 0 && {
          related: rest.map((field) => ({
            path: fieldPath(field),
            message: "The cycle continues through this field.",
          })),
        }),
      });
    }
  }

  checkInterfaceImplementations(): void {
    for (const { owner, ...problem } of interfaceConformanceProblems(
      this.definitions,
    )) {
      this.#collector.add({
        code: "PH-DM-INTERFACE-INVALID",
        path: this.#claims.get(owner)?.path ?? [],
        ...problem,
      });
    }
  }

  #namedDefinition(
    descriptor: AnyTypeDescriptor,
    path: DefinitionPath,
  ): NamedGraphQLTypeDefinition {
    const name = this.#requireName(descriptor, path);
    switch (descriptor.kind) {
      case "enum":
        return {
          kind: "enum",
          name,
          description: descriptor.description,
          values: (descriptor as EnumDescriptor).values.map(
            (value): EnumValueDefinition => ({
              name: value.name,
              description: value.description,
              deprecated: value.deprecated,
            }),
          ),
        };
      case "object":
      case "interface": {
        const implementing = descriptor as
          | ObjectDescriptor
          | InterfaceDescriptor;
        const implemented = implementing.implements.map((entry, index) =>
          this.#requireName(entry, [...path, "implements", index]),
        );
        return {
          kind: descriptor.kind,
          name,
          description: descriptor.description,
          ...(implemented.length > 0 && { implements: implemented }),
          fields: this.#requireFields(
            implementing.fields,
            descriptor.kind,
            name,
            path,
          ),
        };
      }
      case "input":
        return {
          kind: "input",
          name,
          description: descriptor.description,
          unknownKeys: "preserve",
          fields: this.#inputFields(descriptor as InputDescriptor, path),
        };
      case "union":
        return {
          kind: "union",
          name,
          description: descriptor.description,
          members: (descriptor as UnionDescriptor).members.map(
            (member, index) =>
              this.#requireName(member, [...path, "members", index]),
          ),
        };
    }
  }

  #attempt<T>(build: () => T): T | undefined {
    try {
      return this.#collector.capture(build);
    } catch (error) {
      if (error instanceof WalkAbort) return undefined;
      throw error;
    }
  }

  #typeReference(
    field: AnyFieldDescriptor,
    path: DefinitionPath,
  ): TypeReferenceDefinition {
    switch (field.kind) {
      case "scalar": {
        const scalar = field as ScalarDescriptor<unknown, unknown>;
        return {
          kind: "scalar",
          name: this.#scalarName(scalar, path),
          required: scalar.required,
        };
      }
      case "list": {
        const list = field as ListDescriptor<unknown, unknown>;
        return {
          kind: "list",
          required: list.required,
          item: this.#typeReference(list.item, [...path, "item"]),
        };
      }
      case "ref": {
        const reference = field as ReferenceDescriptor<unknown, unknown>;
        const target = this.#resolve(reference, path);
        if (target === undefined) throw new WalkAbort();
        return {
          kind: "named",
          name: this.#requireName(target, path),
          required: reference.required,
        };
      }
    }
  }

  #requireFields(
    fields: ObjectFields,
    kind: "object" | "interface",
    name: string,
    path: DefinitionPath,
  ): FieldDefinition[] {
    if (Object.keys(fields).length === 0) {
      this.#collector.add({
        code: "PH-DM-DECLARATION-INVALID",
        path: [...path, "fields"],
        message: `The ${kind} type ${JSON.stringify(name)} declares no fields, and GraphQL cannot build a schema that contains it.`,
        expected: "at least one field",
        received: "no fields",
        repair: `Give ${JSON.stringify(name)} a field, or remove it from the model. Only ph.input({ fields: {} }) may be member-less, because it projects _empty: Boolean.`,
      });
      throw new WalkAbort();
    }
    return Object.entries(fields).map(([key, field]) => ({
      key,
      name: key,
      description: field.presentation.description,
      deprecated: field.presentation.deprecated,
      type: this.#typeReference(field, [...path, "fields", key]),
      ...directivesOf(field),
    }));
  }

  #inputFields(
    owner: InputDescriptor,
    path: DefinitionPath,
  ): InputFieldDefinition[] {
    return Object.entries(owner.fields).map(([key, field]) => {
      const defaultValue = fieldDefault(field);
      const fieldPath = [...path, "fields", key];
      const type = this.#typeReference(field, fieldPath);
      if (!this.#checkInputDefault(field, type, fieldPath)) {
        this.#checkDefaultCycle(owner, key, fieldPath);
      }
      this.#checkInputDeprecation(field, type, fieldPath);
      return {
        key,
        name: key,
        description: field.presentation.description,
        deprecated: field.presentation.deprecated,
        type,
        ...(defaultValue !== undefined && { defaultValue }),
        ...directivesOf(field),
      };
    });
  }

  #visitChildren(
    descriptor: AnyTypeDescriptor,
    position: Position,
    path: DefinitionPath,
  ): void {
    switch (descriptor.kind) {
      case "enum":
        return;
      case "input":
        this.#visitFields(
          (descriptor as InputDescriptor).fields,
          "input",
          path,
        );
        return;
      case "union":
        (descriptor as UnionDescriptor).members.forEach((member, index) =>
          this.visitType(member, "output", [...path, "members", index]),
        );
        return;
      case "object":
      case "interface": {
        const implementing = descriptor as
          | ObjectDescriptor
          | InterfaceDescriptor;
        implementing.implements.forEach((entry, index) =>
          this.visitType(entry, "output", [...path, "implements", index]),
        );
        this.#visitFields(implementing.fields, position, path);
        return;
      }
    }
  }

  #visitFields(
    fields: ObjectFields,
    position: Position,
    path: DefinitionPath,
  ): void {
    for (const [key, field] of Object.entries(fields)) {
      this.#visitField(field, position, [...path, "fields", key]);
    }
  }

  #visitField(
    field: AnyFieldDescriptor,
    position: Position,
    path: DefinitionPath,
  ): void {
    if (position === "output" && fieldDefault(field) !== undefined) {
      this.#collector.add({
        code: "PH-DM-DEFAULT-UNSUPPORTED",
        path,
        message:
          "A document state field cannot declare a GraphQL default value.",
        expected: "no defaultValue on a document state field use",
        received: "defaultValue",
        repair:
          "Remove defaultValue and set the value in the scope initial value or in the reducer. To default an operation input, declare defaultValue on the field of its ph.input.",
      });
    }
    switch (field.kind) {
      case "scalar":
        return;
      case "list":
        this.#visitField(
          (field as ListDescriptor<unknown, unknown>).item,
          position,
          [...path, "item"],
        );
        return;
      case "ref": {
        const target = this.#resolve(
          field as ReferenceDescriptor<unknown, unknown>,
          path,
        );
        if (
          target === undefined ||
          !this.#checkPosition(target, position, path)
        )
          return;
        this.visitType(target, position, path);
        return;
      }
    }
  }

  #checkInputDefault(
    field: AnyFieldDescriptor,
    type: TypeReferenceDefinition,
    path: DefinitionPath,
  ): boolean {
    const value = fieldDefault(field);
    if (value === undefined) return false;
    const problem = inputDefaultProblem(field, value);
    if (problem === null) return false;
    const typeText = printTypeReference(type);
    this.#collector.add({
      code: "PH-DEF-OPTION-INVALID",
      path: [...path, "defaultValue"],
      message: `defaultValue is not a valid value of type ${typeText}: ${problem}.`,
      expected: `a value of type ${typeText}`,
      received: canonicalJson(value),
      repair: "Use a default the field's type accepts, or remove defaultValue.",
    });
    return true;
  }

  #checkInputDeprecation(
    field: AnyFieldDescriptor,
    type: TypeReferenceDefinition,
    path: DefinitionPath,
  ): void {
    if (
      field.presentation.deprecated === null ||
      !type.required ||
      fieldDefault(field) !== undefined
    )
      return;
    this.#collector.add({
      code: "PH-DEF-FIELD-OPTION-UNSUPPORTED",
      path: [...path, "deprecated"],
      message: `Required input field ${String(path.at(-1))} cannot be deprecated: a caller has to supply it, so GraphQL refuses the schema.`,
      expected:
        "no deprecated on a required input field without a defaultValue",
      received: "deprecated",
      repair:
        "Remove required, give the field a defaultValue, or remove deprecated.",
    });
  }

  #checkDefaultCycle(
    owner: InputDescriptor,
    key: string,
    path: DefinitionPath,
  ): void {
    const cycle = inputDefaultCycle(owner, key);
    if (cycle === null) return;
    this.#collector.add({
      code: "PH-DEF-OPTION-INVALID",
      path: [...path, "defaultValue"],
      message: `defaultValue builds input ${owner.name} from itself through the object defaults on ${cycle.join(", ")}, which GraphQL cannot resolve.`,
      expected: "no cycle of object defaults between input types",
      received: canonicalJson(fieldDefault(owner.fields[key]) ?? null),
      repair:
        "Remove any one object default in the cycle, or default a nullable field in it to null. Either change clears every diagnostic this cycle reports.",
    });
  }

  #resolve(
    reference: ReferenceDescriptor<unknown, unknown>,
    path: DefinitionPath,
  ): AnyTypeDescriptor | undefined {
    try {
      return resolveReference(reference);
    } catch (error) {
      if (error instanceof DefinitionError) {
        for (const diagnostic of error.diagnostics) {
          this.#collector.add({
            code: "PH-DEF-REFERENCE-TARGET-INVALID",
            path,
            message: diagnostic.message,
            ...(diagnostic.received !== undefined && {
              received: diagnostic.received,
            }),
            repair: diagnostic.repair,
          });
        }
        return undefined;
      }
      this.#collector.add({
        code: "PH-DEF-REFERENCE-TARGET-INVALID",
        path,
        message: `A ph.ref target could not be resolved: ${error instanceof Error ? error.message : String(error)}`,
        repair:
          "Return an initialized named type from the thunk passed to ph.ref.",
      });
      return undefined;
    }
  }

  #checkPosition(
    target: AnyTypeDescriptor,
    position: Position,
    path: DefinitionPath,
  ): boolean {
    const allowed =
      position === "input"
        ? target.kind === "input" || target.kind === "enum"
        : target.kind !== "input";
    if (allowed) return true;
    this.#collector.add({
      code: "PH-DM-TYPE-POSITION-INVALID",
      path,
      message: `The ${target.kind} type ${JSON.stringify(target.name)} cannot be referenced from an ${position} position.`,
      expected:
        position === "input"
          ? "a ph.input or ph.enum type"
          : "an object, interface, enum, or union type",
      received: `${target.kind} ${JSON.stringify(target.name)}`,
      repair:
        position === "input"
          ? "Reference a ph.input or ph.enum type from an operation input."
          : "Reference an output type from document state; an input type cannot be part of stored state.",
    });
    return false;
  }

  #claimName(descriptor: AnyTypeDescriptor, path: DefinitionPath): boolean {
    if (descriptor.name === null) return true;
    const reserved = reservedScalar(descriptor.name);
    if (reserved !== undefined) {
      this.#collector.add({
        code: "PH-DEF-NAME-INVALID",
        path,
        message: `GraphQL name ${JSON.stringify(descriptor.name)} is ${reserved}, so a named type cannot take it.`,
        expected: "a name no scalar of the catalog or of GraphQL uses",
        received: descriptor.name,
        repair: `Rename the ${descriptor.kind} type.`,
      });
      return false;
    }
    if (this.packageScalars.has(descriptor.name)) {
      this.#scalarTypeCollision(descriptor.name, path);
      return false;
    }
    const claim = this.#claims.get(descriptor.name);
    if (claim === undefined) {
      this.#claims.set(descriptor.name, { token: descriptor, path });
      return true;
    }
    if (claim.token === descriptor) return true;
    this.#collector.add({
      code: "PH-DM-DUPLICATE-NAME",
      path,
      message: `GraphQL type name ${JSON.stringify(descriptor.name)} is claimed by two different descriptors.`,
      expected: "one descriptor per GraphQL type name",
      received: descriptor.name,
      repair:
        "Rename one of the two types, or reuse the same descriptor token in both places.",
      related: [
        {
          path: claim.path,
          message: `The other descriptor named ${JSON.stringify(descriptor.name)} was declared here.`,
        },
      ],
    });
    return false;
  }

  #scalarName(
    scalar: ScalarDescriptor<unknown, unknown>,
    path: DefinitionPath,
  ): string {
    const name = scalar.scalarName;
    const definition = scalar.definition;
    if (definition === undefined) return name;
    if (getCatalogScalar(name) !== undefined) {
      this.catalogScalars.add(name);
      return name;
    }
    const known = this.packageScalars.get(name);
    if (known !== undefined && known !== definition) {
      this.#collector.add({
        code: "PH-SCALAR-DUPLICATE-NAME",
        definition: { kind: "scalar", key: name },
        path,
        message: `Two different project scalars are named ${name}.`,
        received: name,
        repair: `Declare ${name} once with defineScalar and import that definition everywhere it is used.`,
      });
      throw new WalkAbort();
    }
    if (known === undefined && this.#claims.has(name)) {
      this.#scalarTypeCollision(name, path);
      throw new WalkAbort();
    }
    this.packageScalars.set(name, definition);
    return name;
  }

  #scalarTypeCollision(name: string, path: DefinitionPath): void {
    this.#collector.add({
      code: "PH-DM-DUPLICATE-NAME",
      path,
      message: `GraphQL name ${JSON.stringify(name)} is claimed by a project scalar and a named type.`,
      expected: "one GraphQL definition per name",
      received: name,
      repair: "Rename the scalar or the type.",
    });
  }

  #requireName(descriptor: AnyTypeDescriptor, path: DefinitionPath): string {
    if (descriptor.name !== null) return descriptor.name;
    this.#collector.add({
      code: "PH-DEF-REFERENCE-TARGET-INVALID",
      path,
      message: "An anonymous input has no GraphQL name in this position.",
      repair:
        'Name the input as ph.input("PagingInput", { fields }), or use it as one operation input.',
    });
    throw new WalkAbort();
  }
}

function reservedScalar(name: string): string | undefined {
  if (Object.hasOwn(builtInScalarFactories, name)) {
    return "a built-in GraphQL scalar";
  }
  if (getCatalogScalar(name) !== undefined) {
    return `the catalog scalar ${name}, which every host declares`;
  }
  return undefined;
}
