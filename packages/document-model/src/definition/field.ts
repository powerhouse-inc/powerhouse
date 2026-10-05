import { z } from "zod";
import {
  isTypeDescriptor,
  registerFieldDescriptor,
  registerReference,
  registerScalarFactory,
  registerTypeDescriptor,
} from "./descriptor-registry.js";
import { failDefinition } from "./diagnostics.js";
import {
  assertAuthoredName,
  assertBareListItem,
  assertFieldUse,
  assertNamedType,
  createScalarField,
  resolveFieldOptions,
  snapshotDataOptions,
  snapshotDescriptorArray,
  snapshotDescriptorOptions,
  snapshotFieldMap,
} from "./field-options.js";
import { isEnumValueName } from "./primitives.js";
import { scalarFactories } from "./scalars/catalog.js";
import {
  computedField,
  computedTokens,
  isComputedField,
} from "./subgraph/entries.js";
import type {
  AnyComputedFieldDescriptor,
  OutputMembers,
} from "./subgraph/types.js";
import {
  type AnyFieldDescriptor,
  type AnyTypeDescriptor,
  type EnumDescriptor,
  type EnumValue,
  type EnumValueInput,
  FIELD_USE_ROLE,
  type FieldOptions,
  type InputDescriptor,
  type InputOf,
  type InterfaceDescriptor,
  type ListDescriptor,
  NAMED_TYPE_ROLE,
  type Nullable,
  type ObjectDescriptor,
  type ObjectFields,
  type OutputOf,
  type ReferenceDescriptor,
  type ScalarDescriptor,
  type SourceOf,
  type UnionDescriptor,
} from "./types.js";
import { buildValidator } from "./zod.js";

type NamedOptions = { readonly description?: string };
type EnumOptions<TValues extends readonly EnumValueInput[]> = NamedOptions & {
  readonly values: TValues;
};
type FieldsOptions<TFields extends ObjectFields> = NamedOptions & {
  readonly fields: TFields;
};
type ObjectOptions<
  TFields extends OutputMembers,
  TImplements extends readonly InterfaceDescriptor[],
> = NamedOptions & {
  // An output object may declare computed members beside its stored fields;
  // an input object may not, which is why `FieldsOptions` stays narrow.
  readonly fields: TFields;
  readonly implements?: TImplements;
};
type UnionOptions<TMembers extends readonly ObjectDescriptor[]> =
  NamedOptions & {
    readonly members: TMembers;
  };

const stringValidator = z.string();
const numberValidator = z.number();
const booleanValidator = z.boolean();

type BuiltInName = "ID" | "String" | "Boolean" | "Int" | "Float";
type BuiltInBase<TName extends BuiltInName> = TName extends "Boolean"
  ? boolean
  : TName extends "Int" | "Float"
    ? number
    : string;

type BuiltInFactory<TName extends BuiltInName> = {
  <const TRequired extends boolean = false>(
    options?: FieldOptions<TRequired>,
  ): ScalarDescriptor<
    Nullable<BuiltInBase<TName>, TRequired>,
    Nullable<BuiltInBase<TName>, TRequired>,
    Nullable<BuiltInBase<TName>, TRequired>,
    TRequired
  >;
  readonly role: `field-use factory; call it, as ph.${TName}({ required: true })`;
  readonly kind: "scalar-factory";
};

function builtInFactory<const TName extends BuiltInName>(
  name: TName,
  validator: z.ZodType,
): BuiltInFactory<TName> {
  const factory = <const TRequired extends boolean = false>(
    options?: FieldOptions<TRequired>,
  ) =>
    createScalarField<BuiltInBase<TName>, TRequired>(name, validator, options);
  return registerScalarFactory(
    Object.freeze(
      Object.assign(factory, {
        role: `field-use factory; call it, as ph.${name}({ required: true })` as const,
        kind: "scalar-factory" as const,
      }),
    ),
  );
}

function description(options: {
  readonly [key: string]: unknown;
}): string | null {
  if (!Object.hasOwn(options, "description")) return null;
  if (typeof options.description !== "string") {
    return failDefinition({
      code: "PH-DEF-OPTION-INVALID",
      path: ["options", "description"],
      message: "A named type description must be a string.",
      expected: "string",
      received: typeof options.description,
      repair: "Pass a string description or omit it.",
    });
  }
  return options.description;
}

function fieldMap(value: unknown, path: readonly string[]): ObjectFields {
  const members = splitMembers(value, path);
  const computed = Object.keys(members.computed);
  if (computed.length > 0) {
    // Dropping them silently would produce an input type missing the fields
    // its author wrote, and a resolver has nothing to compute on an input.
    failDefinition({
      code: "PH-SG-COMPUTED-FIELD-INVALID",
      path: [...path, computed[0]],
      message: `Field ${JSON.stringify(computed[0])} is computed, and only an output object can declare one.`,
      received: computed.join(", "),
      repair:
        "Declare it with an ordinary field use, or move it to the output object a resolver completes.",
    });
  }
  return members.fields;
}

/**
 * Separates an output object's stored fields from its computed members.
 *
 * A computed field is declared here and resolved elsewhere, so it belongs to
 * the schema but not to the stored shape: keeping the two apart means every
 * existing consumer of `fields` sees exactly what it saw before, and nothing
 * downstream has to learn what a computed member is.
 */
function splitMembers(
  value: unknown,
  path: readonly string[],
): {
  readonly fields: ObjectFields;
  readonly computed: Readonly<Record<string, AnyComputedFieldDescriptor>>;
} {
  const members = snapshotFieldMap(value, path);
  const fields: Record<string, AnyFieldDescriptor> = {};
  const computed: Record<string, AnyComputedFieldDescriptor> = {};
  for (const [key, member] of Object.entries(members)) {
    assertAuthoredName(key, [...path, key]);
    if (isComputedField(member)) {
      computed[key] = member;
      continue;
    }
    assertFieldUse(member, [...path, key]);
    fields[key] = member;
  }
  return {
    fields: Object.freeze(fields),
    computed: Object.freeze(computed),
  };
}

function enumValues(input: unknown): readonly EnumValue[] {
  const entries = snapshotDescriptorArray(
    input,
    ["options", "values"],
    "PH-DEF-ENUM-VALUES-INVALID",
    "Pass values as a nonempty array of strings or { name, description?, deprecated? } entries.",
  );
  if (entries.length === 0) {
    failDefinition({
      code: "PH-DEF-ENUM-VALUES-INVALID",
      path: ["options", "values"],
      message: "An enum must declare at least one value.",
      repair: "Add at least one enum value.",
    });
  }
  const seen = new Set<string>();
  return Object.freeze(
    entries.map((entry, index): EnumValue => {
      const path = ["options", "values", index];
      const normalized =
        typeof entry === "string"
          ? { name: entry }
          : snapshotDataOptions(
              entry,
              ["name", "description", "deprecated"],
              path,
            );
      const name = assertAuthoredName(normalized.name, [...path, "name"]);
      if (!isEnumValueName(name)) {
        failDefinition({
          code: "PH-DEF-ENUM-VALUES-INVALID",
          path: [...path, "name"],
          message: `${JSON.stringify(name)} is a reserved GraphQL literal and cannot be an enum value.`,
          received: name,
          repair: `Rename the value; true, false, and null are GraphQL literals.`,
        });
      }
      if (seen.has(name)) {
        failDefinition({
          code: "PH-DEF-ENUM-VALUES-INVALID",
          path: [...path, "name"],
          message: `Enum value ${JSON.stringify(name)} is declared twice.`,
          received: name,
          repair: "Keep one declaration per enum value.",
        });
      }
      seen.add(name);
      for (const key of ["description", "deprecated"] as const) {
        if (
          Object.hasOwn(normalized, key) &&
          typeof normalized[key] !== "string"
        ) {
          failDefinition({
            code: "PH-DEF-OPTION-INVALID",
            path: [...path, key],
            message: `Enum value ${key} must be a string.`,
            expected: "string",
            received: typeof normalized[key],
            repair: `Pass a string ${key} or omit it.`,
          });
        }
      }
      return Object.freeze({
        name,
        description: (normalized.description as string | undefined) ?? null,
        deprecated: (normalized.deprecated as string | undefined) ?? null,
      });
    }),
  );
}

function namedType<T extends AnyTypeDescriptor>(
  node: Omit<T, "validator" | "role" | "identity">,
): T {
  const descriptor = {
    ...node,
    role: NAMED_TYPE_ROLE,
    identity: Object.freeze({
      kind: node.kind,
      name: node.name,
      description: node.description,
    }),
    validator: undefined as unknown as z.ZodType,
  } as unknown as T & { validator: z.ZodType };
  descriptor.validator = buildValidator(descriptor, "output");
  return registerTypeDescriptor(Object.freeze(descriptor));
}

function refTarget(
  candidate: unknown,
  path: readonly string[],
): AnyTypeDescriptor {
  assertNamedType(
    candidate,
    path,
    "PH-DEF-REFERENCE-TARGET-INVALID",
    "Pass a named type returned by ph.enum, ph.object, ph.input, ph.interface, or ph.union, or a thunk returning one.",
  );
  if (candidate.name === null) {
    failDefinition({
      code: "PH-DEF-REFERENCE-TARGET-INVALID",
      path,
      message: "An anonymous input cannot be a reference target.",
      repair: 'Give the input a name: ph.input("NameInput", { fields }).',
    });
  }
  return candidate;
}

export const ph = Object.freeze({
  ID: builtInFactory("ID", stringValidator),
  String: builtInFactory("String", stringValidator),
  Boolean: builtInFactory("Boolean", booleanValidator),
  Int: builtInFactory("Int", numberValidator),
  Float: builtInFactory("Float", numberValidator),
  ...scalarFactories,

  list<
    const TItem extends AnyFieldDescriptor,
    const TRequired extends boolean = false,
  >(
    item: TItem,
    options?: FieldOptions<TRequired>,
  ): ListDescriptor<
    Nullable<readonly InputOf<TItem>[], TRequired>,
    Nullable<readonly OutputOf<TItem>[], TRequired>,
    Nullable<readonly SourceOf<TItem>[], TRequired>,
    TRequired
  > {
    assertFieldUse(item, ["item"]);
    assertBareListItem(item, ["item"]);
    const { required, presentation } = resolveFieldOptions(options, [
      "options",
    ]);
    const descriptor = {
      kind: "list" as const,
      role: FIELD_USE_ROLE,
      identity: Object.freeze({
        kind: "list" as const,
        required,
        item: item.identity,
      }),
      item,
      required,
      presentation,
      validator: undefined as unknown as z.ZodType,
    };
    descriptor.validator = buildValidator(descriptor, "output");
    return registerFieldDescriptor(
      Object.freeze(descriptor) as ListDescriptor<any, any, any, TRequired>,
    );
  },

  ref<
    const TTarget extends AnyTypeDescriptor,
    const TRequired extends boolean = false,
  >(
    target: TTarget | (() => TTarget),
    options?: FieldOptions<TRequired>,
  ): ReferenceDescriptor<
    Nullable<InputOf<TTarget>, TRequired>,
    Nullable<OutputOf<TTarget>, TRequired>,
    Nullable<SourceOf<TTarget>, TRequired>,
    TRequired
  > {
    let resolved: AnyTypeDescriptor | undefined;
    const resolve = (): AnyTypeDescriptor => {
      if (resolved === undefined) {
        const candidate: unknown =
          typeof target === "function" && !isTypeDescriptor(target)
            ? target()
            : target;
        resolved = refTarget(candidate, ["target"]);
      }
      return resolved;
    };
    if (typeof target !== "function") resolve();
    const { required, presentation } = resolveFieldOptions(options, [
      "options",
    ]);
    const descriptor = {
      kind: "ref" as const,
      role: FIELD_USE_ROLE,
      identity: Object.freeze({ kind: "ref" as const, required }),
      target,
      required,
      presentation,
      validator: undefined as unknown as z.ZodType,
    };
    const reference = descriptor as unknown as ReferenceDescriptor<
      any,
      any,
      any,
      TRequired
    >;
    registerReference(reference, resolve);
    descriptor.validator = buildValidator(reference, "output");
    return registerFieldDescriptor(Object.freeze(reference));
  },

  enum<const TValues extends readonly [EnumValueInput, ...EnumValueInput[]]>(
    name: string,
    options: EnumOptions<TValues>,
  ): EnumDescriptor<TValues> {
    const validName = assertAuthoredName(name, ["name"]);
    const config = snapshotDescriptorOptions(
      options,
      ["values", "description"],
      ["options"],
    );
    return namedType<EnumDescriptor<TValues>>({
      kind: "enum",
      name: validName,
      description: description(config),
      values: enumValues(config.values),
    });
  },

  /**
   * Declares a field a resolver computes.
   *
   * Schema only: the implementation is bound in a subgraph's entries
   * callback, where the host instance and the request type are in scope. An
   * object carrying one exposes `Type.computedTokens.<field>` to bind through.
   */
  field: computedField,

  object<
    const TFields extends OutputMembers,
    const TImplements extends readonly InterfaceDescriptor[] = readonly [],
  >(
    name: string,
    options: ObjectOptions<TFields, TImplements>,
  ): ObjectDescriptor<TFields, TImplements> {
    const validName = assertAuthoredName(name, ["name"]);
    const config = snapshotDescriptorOptions(
      options,
      ["fields", "description", "implements"],
      ["options"],
    );
    const members = splitMembers(config.fields, ["options", "fields"]);
    const fields = members.fields as TFields;
    const implemented = Object.hasOwn(config, "implements")
      ? snapshotDescriptorArray(
          config.implements,
          ["options", "implements"],
          "PH-DEF-IMPLEMENTS-INVALID",
          "Pass implements as an array of descriptors returned by ph.interface.",
        )
      : [];
    const seen = new Set<string>();
    implemented.forEach((candidate, index) => {
      const path = ["options", "implements", index];
      assertNamedType(
        candidate,
        path,
        "PH-DEF-IMPLEMENTS-INVALID",
        "Pass a descriptor returned by ph.interface.",
      );
      if (candidate.kind !== "interface") {
        failDefinition({
          code: "PH-DEF-IMPLEMENTS-INVALID",
          path,
          message: `${JSON.stringify(candidate.name)} is a ${candidate.kind}, not an interface.`,
          received: candidate.kind,
          repair:
            "Only descriptors returned by ph.interface can be implemented.",
        });
      }
      const interfaceName = candidate.name as string;
      if (seen.has(interfaceName)) {
        failDefinition({
          code: "PH-DEF-IMPLEMENTS-INVALID",
          path,
          message: `Interface ${JSON.stringify(interfaceName)} is implemented twice.`,
          received: interfaceName,
          repair: "List each implemented interface once.",
        });
      }
      seen.add(interfaceName);
    });
    return namedType<ObjectDescriptor<TFields, TImplements>>({
      kind: "object",
      name: validName,
      description: description(config),
      fields,
      implements: Object.freeze([...implemented]) as unknown as TImplements,
      // Present whether or not anything is computed, so a binding reads the
      // same on every object and a typo is a compile error rather than a
      // read of `undefined`.
      computed: members.computed,
      computedTokens: computedTokens(validName, members.computed),
    });
  },

  interface<const TFields extends ObjectFields>(
    name: string,
    options: FieldsOptions<TFields>,
  ): InterfaceDescriptor<TFields> {
    const validName = assertAuthoredName(name, ["name"]);
    const config = snapshotDescriptorOptions(
      options,
      ["fields", "description"],
      ["options"],
    );
    return namedType<InterfaceDescriptor<TFields>>({
      kind: "interface",
      name: validName,
      description: description(config),
      fields: fieldMap(config.fields, ["options", "fields"]) as TFields,
    });
  },

  input<const TFields extends ObjectFields>(
    nameOrOptions: string | FieldsOptions<TFields>,
    maybeOptions?: FieldsOptions<TFields>,
  ): InputDescriptor<TFields> {
    const name =
      typeof nameOrOptions === "string"
        ? assertAuthoredName(nameOrOptions, ["name"])
        : null;
    const options =
      typeof nameOrOptions === "string" ? maybeOptions : nameOrOptions;
    const config = snapshotDescriptorOptions(
      options,
      ["fields", "description"],
      ["options"],
    );
    return namedType<InputDescriptor<TFields>>({
      kind: "input",
      name,
      description: description(config),
      fields: fieldMap(config.fields, ["options", "fields"]) as TFields,
    });
  },

  union<
    const TMembers extends readonly [ObjectDescriptor, ...ObjectDescriptor[]],
  >(name: string, options: UnionOptions<TMembers>): UnionDescriptor<TMembers> {
    const validName = assertAuthoredName(name, ["name"]);
    const config = snapshotDescriptorOptions(
      options,
      ["members", "description"],
      ["options"],
    );
    const members = snapshotDescriptorArray(
      config.members,
      ["options", "members"],
      "PH-DEF-UNION-MEMBERS-INVALID",
      "Pass members as a nonempty array of descriptors returned by ph.object.",
    );
    if (members.length === 0) {
      failDefinition({
        code: "PH-DEF-UNION-MEMBERS-INVALID",
        path: ["options", "members"],
        message: "A union must declare at least one object member.",
        repair: "Add at least one ph.object descriptor to members.",
      });
    }
    const seen = new Set<string>();
    members.forEach((member, index) => {
      const path = ["options", "members", index];
      assertNamedType(
        member,
        path,
        "PH-DEF-UNION-MEMBERS-INVALID",
        "Replace the member with a descriptor returned by ph.object.",
      );
      if (member.kind !== "object") {
        failDefinition({
          code: "PH-DEF-UNION-MEMBERS-INVALID",
          path,
          message: `Union member ${JSON.stringify(member.name)} is a ${member.kind}; GraphQL unions hold object types only.`,
          received: member.kind,
          repair: "Replace the member with a descriptor returned by ph.object.",
        });
      }
      const memberName = member.name as string;
      if (seen.has(memberName)) {
        failDefinition({
          code: "PH-DEF-UNION-MEMBERS-INVALID",
          path,
          message: `Union member ${JSON.stringify(memberName)} is declared twice.`,
          received: memberName,
          repair: "List each member object once.",
        });
      }
      seen.add(memberName);
    });
    return namedType<UnionDescriptor<TMembers>>({
      kind: "union",
      name: validName,
      description: description(config),
      members: Object.freeze([...members]) as unknown as TMembers,
    });
  },
});

export type Ph = typeof ph;

/**
 * Returns a named view of an anonymous input for one operation. The original
 * token stays anonymous and immutable, so two operations can reuse it and each
 * derive its own name.
 */
export function nameAnonymousInput<TFields extends ObjectFields>(
  descriptor: InputDescriptor<TFields>,
  name: string,
): InputDescriptor<TFields> {
  assertNamedType(
    descriptor,
    ["descriptor"],
    "PH-DEF-REFERENCE-TARGET-INVALID",
    "Pass a descriptor returned by ph.input.",
  );
  if (descriptor.name !== null) return descriptor;
  const validName = assertAuthoredName(name, ["name"]);
  return registerTypeDescriptor(
    Object.freeze({
      ...descriptor,
      name: validName,
      identity: Object.freeze({
        kind: "input" as const,
        name: validName,
        description: descriptor.description,
      }),
    }),
  );
}
