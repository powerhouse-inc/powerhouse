import { dslDiagnostics } from "./diagnostic-codes.js";
import type { z } from "zod";
import {
  isTypeDescriptor,
  registerFieldDescriptor,
  registerReference,
  registerTypeDescriptor,
} from "./descriptor-registry.js";
import {
  assertAuthoredName,
  assertBareListItem,
  assertFieldUse,
  assertNamedType,
  resolveFieldOptions,
  snapshotDataOptions,
  snapshotDescriptorArray,
  snapshotDescriptorOptions,
  snapshotFieldMap,
  stringOption,
} from "./field-options.js";
import { isEnumValueName } from "../kernel/primitives.js";
import {
  type AnyFieldDescriptor,
  type AnyTypeDescriptor,
  type EnumDescriptor,
  type EnumValue,
  type EnumValueInput,
  FIELD_USE_ROLE,
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
  type SourceOf,
  type UnionDescriptor,
  type DefaultFlag,
  type FieldBuilderOptions,
  type JsonLiteral,
} from "./types.js";
import {
  builtInScalarFactories,
  catalogScalarFactories,
  scalarField,
} from "./scalar-fields.js";
import { buildValidator } from "./zod.js";

type NamedOptions = { readonly description?: string };
type EnumOptions<TValues extends readonly EnumValueInput[]> = NamedOptions & {
  readonly values: TValues;
};
type FieldsOptions<TFields extends ObjectFields> = NamedOptions & {
  readonly fields: TFields;
};
type ImplementsOptions<TImplements extends readonly InterfaceDescriptor[]> = {
  readonly implements?: TImplements;
};
type ImplementingOptions<
  TFields extends ObjectFields,
  TImplements extends readonly InterfaceDescriptor[],
> = FieldsOptions<TFields> & ImplementsOptions<TImplements>;
type UnionOptions<TMembers extends readonly ObjectDescriptor[]> =
  NamedOptions & {
    readonly members: TMembers;
  };

const KIND_NOUNS: Readonly<Record<AnyTypeDescriptor["kind"], string>> = {
  enum: "an enum",
  object: "an object",
  input: "an input",
  interface: "an interface",
  union: "a union",
};

function fieldMap(value: unknown, path: readonly string[]): ObjectFields {
  const members = snapshotFieldMap(value, path);
  for (const [key, member] of Object.entries(members)) {
    assertAuthoredName(key, [...path, key]);
    assertFieldUse(member, [...path, key]);
  }
  return Object.freeze({ ...members }) as ObjectFields;
}

function enumValues(input: unknown): readonly EnumValue[] {
  const entries = snapshotDescriptorArray(
    input,
    ["options", "values"],
    "PH-DEF-ENUM-VALUES-INVALID",
    "Pass values as a nonempty array of strings or { name, description?, deprecated? } entries.",
  );
  if (entries.length === 0) {
    dslDiagnostics.fail({
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
        dslDiagnostics.fail({
          code: "PH-DEF-ENUM-VALUES-INVALID",
          path: [...path, "name"],
          message: `${JSON.stringify(name)} is a reserved GraphQL literal and cannot be an enum value.`,
          received: name,
          repair: `Rename the value; true, false, and null are GraphQL literals.`,
        });
      }
      if (seen.has(name)) {
        dslDiagnostics.fail({
          code: "PH-DEF-ENUM-VALUES-INVALID",
          path: [...path, "name"],
          message: `Enum value ${JSON.stringify(name)} is declared twice.`,
          received: name,
          repair: "Keep one declaration per enum value.",
        });
      }
      seen.add(name);
      return Object.freeze({
        name,
        description: stringOption(normalized, "description", path),
        deprecated: stringOption(normalized, "deprecated", path),
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
  descriptor.validator = buildValidator(descriptor);
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
    dslDiagnostics.fail({
      code: "PH-DEF-REFERENCE-TARGET-INVALID",
      path,
      message: "An anonymous input cannot be a reference target.",
      repair: 'Give the input a name: ph.input("NameInput", { fields }).',
    });
  }
  return candidate;
}

function implementedInterfaces(config: {
  readonly [key: string]: unknown;
}): readonly InterfaceDescriptor[] {
  const implemented =
    config.implements !== undefined
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
      dslDiagnostics.fail({
        code: "PH-DEF-IMPLEMENTS-INVALID",
        path,
        message: `${JSON.stringify(candidate.name)} is ${KIND_NOUNS[candidate.kind]}, not an interface.`,
        received: candidate.kind,
        repair: "Only descriptors returned by ph.interface can be implemented.",
      });
    }
    const interfaceName = candidate.name as string;
    if (seen.has(interfaceName)) {
      dslDiagnostics.fail({
        code: "PH-DEF-IMPLEMENTS-INVALID",
        path,
        message: `Interface ${JSON.stringify(interfaceName)} is implemented twice.`,
        received: interfaceName,
        repair: "List each implemented interface once.",
      });
    }
    seen.add(interfaceName);
  });
  return Object.freeze([...implemented]) as readonly InterfaceDescriptor[];
}

export const ph = Object.freeze({
  ...builtInScalarFactories,
  ...catalogScalarFactories,
  scalar: scalarField,

  list<
    const TItem extends AnyFieldDescriptor,
    const TRequired extends boolean = false,
    const TDefault extends JsonLiteral | undefined = undefined,
  >(
    item: TItem,
    options?: FieldBuilderOptions<TRequired, TDefault>,
  ): ListDescriptor<
    Nullable<readonly InputOf<TItem>[], TRequired>,
    Nullable<readonly OutputOf<TItem>[], TRequired>,
    Nullable<readonly SourceOf<TItem>[], TRequired>,
    TRequired,
    DefaultFlag<TDefault>
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
    descriptor.validator = buildValidator(descriptor);
    return registerFieldDescriptor(
      Object.freeze(descriptor) as unknown as ListDescriptor<
        any,
        any,
        any,
        TRequired,
        DefaultFlag<TDefault>
      >,
    );
  },

  ref<
    const TTarget extends AnyTypeDescriptor,
    const TRequired extends boolean = false,
    const TDefault extends JsonLiteral | undefined = undefined,
  >(
    target: TTarget | (() => TTarget),
    options?: FieldBuilderOptions<TRequired, TDefault>,
  ): ReferenceDescriptor<
    Nullable<InputOf<TTarget>, TRequired>,
    Nullable<OutputOf<TTarget>, TRequired>,
    Nullable<SourceOf<TTarget>, TRequired>,
    TRequired,
    DefaultFlag<TDefault>
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
      TRequired,
      DefaultFlag<TDefault>
    >;
    registerReference(reference, resolve);
    descriptor.validator = buildValidator(reference);
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
      description: stringOption(config, "description", ["options"]),
      values: enumValues(config.values),
    });
  },

  object<
    const TFields extends ObjectFields,
    const TImplements extends readonly InterfaceDescriptor[] = readonly [],
  >(
    name: string,
    options: ImplementingOptions<TFields, TImplements>,
  ): ObjectDescriptor<TFields, TImplements> {
    const validName = assertAuthoredName(name, ["name"]);
    const config = snapshotDescriptorOptions(
      options,
      ["fields", "description", "implements"],
      ["options"],
    );
    return namedType<ObjectDescriptor<TFields, TImplements>>({
      kind: "object",
      name: validName,
      description: stringOption(config, "description", ["options"]),
      fields: fieldMap(config.fields, ["options", "fields"]) as TFields,
      implements: implementedInterfaces(config) as TImplements,
    });
  },

  interface<
    const TFields extends ObjectFields,
    const TImplements extends readonly InterfaceDescriptor[] = readonly [],
  >(
    name: string,
    options: ImplementingOptions<TFields, TImplements>,
  ): InterfaceDescriptor<TFields, TImplements> {
    const validName = assertAuthoredName(name, ["name"]);
    const config = snapshotDescriptorOptions(
      options,
      ["fields", "description", "implements"],
      ["options"],
    );
    return namedType<InterfaceDescriptor<TFields, TImplements>>({
      kind: "interface",
      name: validName,
      description: stringOption(config, "description", ["options"]),
      fields: fieldMap(config.fields, ["options", "fields"]) as TFields,
      implements: implementedInterfaces(config) as TImplements,
    });
  },

  input<const TFields extends ObjectFields>(
    ...args:
      | [name: string, options: FieldsOptions<TFields>]
      | [options: FieldsOptions<TFields>]
  ): InputDescriptor<TFields> {
    const [nameOrOptions, maybeOptions] = args;
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
      description: stringOption(config, "description", ["options"]),
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
      dslDiagnostics.fail({
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
        dslDiagnostics.fail({
          code: "PH-DEF-UNION-MEMBERS-INVALID",
          path,
          message: `Union member ${JSON.stringify(member.name)} is ${KIND_NOUNS[member.kind]}; GraphQL unions hold object types only.`,
          received: member.kind,
          repair: "Replace the member with a descriptor returned by ph.object.",
        });
      }
      const memberName = member.name as string;
      if (seen.has(memberName)) {
        dslDiagnostics.fail({
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
      description: stringOption(config, "description", ["options"]),
      members: Object.freeze([...members]) as unknown as TMembers,
    });
  },
});
