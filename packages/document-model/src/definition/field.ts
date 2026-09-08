import type {
  FieldDefinitionV1,
  InputFieldDefinitionV1,
  JsonValue,
  ScalarNameV1,
  TypeReferenceDefinitionV1,
} from "@powerhousedao/shared/document-model";
import { z } from "zod";
import { snapshotDataArray, snapshotDataRecord } from "./data-properties.js";
import { failDefinition } from "./diagnostics.js";
import {
  isFieldDescriptor,
  isTypeDescriptor,
  registerFieldDescriptor,
  registerTypeDescriptor,
} from "./descriptor-registry.js";
import { isGraphQLName } from "./primitives.js";
import { scalarFactories } from "./scalars/catalog.js";
import type { ScalarFactory } from "./scalars/types.js";
import type {
  AnyComputedFieldDescriptor,
  AnyFieldDescriptor,
  AnyTypeDescriptor,
  ComputedFieldDescriptor,
  ComputedFieldToken,
  EnumDescriptor,
  FieldOptions,
  FieldPresentation,
  InputDescriptor,
  InputOf,
  InterfaceDescriptor,
  ListDescriptor,
  ObjectDescriptor,
  ObjectFields,
  ObjectMembers,
  OutputOf,
  ReferenceDescriptor,
  ScalarDescriptor,
  SourceOf,
  TypeDescriptor,
  UnionDescriptor,
} from "./types.js";

type Nullable<T, TRequired extends boolean> = TRequired extends true
  ? T
  : T | null | undefined;

type NamedOptions = { readonly description?: string };
type EnumOptions<TValues extends readonly string[]> = NamedOptions & {
  readonly values: TValues;
};
type InterfaceOptions<TFields extends ObjectFields> = NamedOptions & {
  readonly fields: TFields;
};
type ObjectOptions<
  TMembers extends ObjectMembers,
  TImplements extends readonly InterfaceDescriptor[],
> = NamedOptions & {
  readonly fields: TMembers;
  readonly implements?: TImplements;
};
type InputOptions<TFields extends ObjectFields> = NamedOptions & {
  readonly fields: TFields;
};
type UnionOptions<TMembers extends readonly ObjectDescriptor[]> =
  NamedOptions & {
    readonly members: TMembers;
  };
type ComputedFieldOptions<
  TArgs extends ObjectFields,
  TReturns extends AnyFieldDescriptor,
> = {
  readonly args?: TArgs;
  readonly returns: TReturns;
  readonly description?: string;
  readonly deprecated?: string;
};

export type Amount = {
  readonly unit?: string;
  readonly value?: number;
};
export type AmountWithNumberValue = {
  readonly value: number;
  readonly unit: string;
};
export type AmountWithStringValue = {
  readonly value: string;
  readonly unit: string;
};
export type Address = `${string}:0x${string}`;
export type AttachmentRef = `attachment://v${number}:${string}`;

const FIELD_OPTION_KEYS = new Set(["required"]);
const computedFieldDescriptors = new WeakSet<object>();
const computedFieldTokens = new WeakSet<object>();
const referenceResolvers = new WeakMap<object, () => AnyTypeDescriptor>();

function snapshotRecord(
  value: unknown,
  allowed: ReadonlySet<string>,
  path: readonly (string | number)[],
): Readonly<Record<string, unknown>> {
  const inspected = snapshotDataRecord(value);
  if (!inspected.ok) {
    if (inspected.reason === "symbol-key") {
      return failDefinition({
        code: "PH-DEF-SYMBOL-KEY-UNSUPPORTED",
        path,
        message: "Descriptor configurations cannot contain symbol keys.",
        repair: "Replace the symbol key with a documented string property.",
      });
    }
    if (inspected.reason === "unstable-property") {
      return failDefinition({
        code: "PH-DEF-FIELD-OPTION-INVALID",
        path:
          inspected.key === undefined ? path : [...path, String(inspected.key)],
        message: `Descriptor property ${JSON.stringify(String(inspected.key))} must be an enumerable data property.`,
        repair:
          "Replace accessors and proxy-backed properties with stable data properties.",
      });
    }
    return failDefinition({
      code: "PH-DEF-OBJECT-EXPECTED",
      path,
      message: "A descriptor configuration could not be inspected.",
      repair: "Pass a plain object with enumerable data properties.",
    });
  }
  for (const key of Object.keys(inspected.value)) {
    if (!allowed.has(key)) {
      failDefinition({
        code: "PH-DEF-FIELD-OPTION-UNSUPPORTED",
        path: [...path, key],
        message: `Field option ${JSON.stringify(key)} is not supported.`,
        expected: [...allowed].join(", "),
        received: key,
        repair:
          "Remove the option and enforce domain validation in the reducer or resolver.",
      });
    }
  }
  return inspected.value;
}

function snapshotArray(
  value: unknown,
  path: readonly (string | number)[],
): readonly unknown[] | null {
  const inspected = snapshotDataArray(value);
  if (!inspected.ok && inspected.reason === "not-array") return null;
  if (!inspected.ok) {
    return failDefinition({
      code: "PH-DEF-FIELD-OPTION-INVALID",
      path:
        inspected.key === undefined
          ? path
          : [
              ...path,
              typeof inspected.key === "number"
                ? inspected.key
                : String(inspected.key),
            ],
      message:
        "A descriptor array must be dense and contain only stable data properties.",
      repair:
        "Pass a plain, dense array without accessors or custom properties.",
    });
  }
  return inspected.value;
}

function fieldPresentation<TRequired extends boolean>(
  options: FieldOptions<TRequired> | undefined,
): { readonly required: TRequired; readonly presentation: FieldPresentation } {
  const config: Readonly<Record<string, unknown>> =
    options === undefined
      ? Object.freeze({})
      : snapshotRecord(options, FIELD_OPTION_KEYS, ["options"]);
  const required = (config.required ?? false) as TRequired;
  if (typeof required !== "boolean") {
    failDefinition({
      code: "PH-DEF-FIELD-OPTION-INVALID",
      path: ["options", "required"],
      message: "Field option required must be a boolean.",
      expected: "boolean",
      received: typeof required,
      repair: "Use required: true, required: false, or omit the option.",
    });
  }
  return {
    required,
    presentation: Object.freeze({
      description: null,
      deprecated: null,
      hasDefaultValue: false,
    }),
  };
}

function nullableValidator<T, TRequired extends boolean>(
  validator: z.ZodType<T, T>,
  required: TRequired,
): z.ZodType<Nullable<T, TRequired>, Nullable<T, TRequired>> {
  return (required ? validator : validator.nullish()) as z.ZodType<
    Nullable<T, TRequired>,
    Nullable<T, TRequired>
  >;
}

function scalar<T, const TRequired extends boolean = false>(
  scalarName: ScalarNameV1,
  validator: z.ZodType<T, T>,
  options?: FieldOptions<TRequired>,
): ScalarDescriptor<
  Nullable<T, TRequired>,
  Nullable<T, TRequired>,
  Nullable<T, TRequired>,
  TRequired
> {
  const { required, presentation } = fieldPresentation(options);
  return registerFieldDescriptor(
    Object.freeze({
      kind: "scalar",
      role: "field use",
      identity: Object.freeze({ kind: "scalar", name: scalarName, required }),
      scalarName,
      required,
      presentation,
      validator: nullableValidator(validator, required),
    }),
  );
}

function assertGraphQLName(name: unknown, path: readonly string[]): string {
  if (!isGraphQLName(name)) {
    failDefinition({
      code: "PH-DEF-GRAPHQL-NAME-INVALID",
      path,
      message:
        "An author-defined GraphQL name must match /^[_A-Za-z][_0-9A-Za-z]*$/ and cannot start with two underscores.",
      expected: "an author-defined GraphQL name",
      received: typeof name === "string" ? name : typeof name,
      repair:
        "Use a nonempty GraphQL name made from letters, digits, and underscores.",
    });
  }
  return name;
}

function snapshotFieldMembers(
  value: unknown,
  path: readonly string[],
  allowComputed: boolean,
): {
  readonly stored: ObjectFields;
  readonly computed: Readonly<Record<string, AnyComputedFieldDescriptor>>;
  readonly order: readonly string[];
} {
  const inspected = snapshotDataRecord(value);
  if (!inspected.ok) {
    if (inspected.reason === "symbol-key") {
      return failDefinition({
        code: "PH-DEF-SYMBOL-KEY-UNSUPPORTED",
        path,
        message: "Descriptor field maps cannot contain symbol keys.",
        repair: "Use GraphQL-compatible string field keys.",
      });
    }
    if (inspected.reason === "unstable-property") {
      return failDefinition({
        code: "PH-DEF-FIELD-INVALID",
        path:
          inspected.key === undefined ? path : [...path, String(inspected.key)],
        message: "A descriptor field must be an enumerable data property.",
        repair:
          "Replace accessors and proxy-backed fields with stable descriptor values.",
      });
    }
    return failDefinition({
      code: "PH-DEF-OBJECT-EXPECTED",
      path,
      message: "A descriptor field map could not be inspected.",
      repair: "Pass a plain object with enumerable data properties.",
    });
  }
  const fields = Object.create(null) as Record<string, AnyFieldDescriptor>;
  const computed = Object.create(null) as Record<
    string,
    AnyComputedFieldDescriptor
  >;
  const order: string[] = [];
  for (const [key, member] of Object.entries(inspected.value)) {
    assertGraphQLName(key, [...path, key]);
    order.push(key);
    if (
      allowComputed &&
      member !== null &&
      typeof member === "object" &&
      computedFieldDescriptors.has(member)
    ) {
      computed[key] = member as AnyComputedFieldDescriptor;
    } else {
      assertFieldDescriptor(member, [...path, key]);
      fields[key] = member;
    }
  }
  return {
    stored: Object.freeze(fields),
    computed: Object.freeze(computed),
    order: Object.freeze(order),
  };
}

function assertFields(value: unknown, path: readonly string[]): ObjectFields {
  return snapshotFieldMembers(value, path, false).stored;
}

function assertFieldDescriptor(
  value: unknown,
  path: readonly (string | number)[],
): asserts value is AnyFieldDescriptor {
  if (typeof value === "function") {
    failDefinition({
      code: "PH-SCALAR-FACTORY-AS-FIELD",
      path,
      message: "A scalar field factory was used without being called.",
      repair: "Call the scalar factory, for example ph.String().",
    });
  }
  if (isTypeDescriptor(value)) {
    failDefinition({
      code: "PH-DEF-TYPE-AS-FIELD",
      path,
      message: "A named type was used directly in a field position.",
      repair: "Wrap the named type with ph.ref(Type).",
    });
  }
  if (!isFieldDescriptor(value)) {
    failDefinition({
      code: "PH-DEF-FIELD-INVALID",
      path,
      message: "A field position must contain a field-use descriptor.",
      repair: "Use a scalar factory, ph.list(...), or ph.ref(Type).",
    });
  }
}

function assertTypeDescriptor(
  value: unknown,
  path: readonly (string | number)[],
): asserts value is AnyTypeDescriptor {
  if (!isTypeDescriptor(value)) {
    failDefinition({
      code: "PH-DEF-REFERENCE-TARGET-INVALID",
      path,
      message: "A reference target must be a named type descriptor.",
      repair:
        "Pass a descriptor returned by ph.enum, ph.object, ph.input, ph.interface, or ph.union.",
    });
  }
}

function objectValidator(fields: ObjectFields): z.ZodType {
  const shape = Object.fromEntries(
    Object.entries(fields).map(([key, descriptor]) => [
      key,
      descriptor.validator,
    ]),
  );
  return z.looseObject(shape);
}

function namedIdentity(
  kind: "enum" | "object" | "input" | "interface" | "union",
  name: string | null,
  description: string | null,
) {
  return Object.freeze({ kind, name, description });
}

function descriptionFrom(options: NamedOptions | undefined): string | null {
  if (
    options?.description !== undefined &&
    typeof options.description !== "string"
  ) {
    failDefinition({
      code: "PH-DEF-TYPE-OPTION-INVALID",
      path: ["options", "description"],
      message: "A named type description must be a string.",
      repair: "Use a string description or omit it.",
    });
  }
  return options?.description ?? null;
}

function computedPresentation(
  options: ComputedFieldOptions<ObjectFields, AnyFieldDescriptor>,
): Omit<FieldPresentation, "hasDefaultValue"> {
  for (const key of ["description", "deprecated"] as const) {
    if (options[key] !== undefined && typeof options[key] !== "string") {
      failDefinition({
        code: "PH-DEF-FIELD-OPTION-INVALID",
        path: ["options", key],
        message: `Computed field option ${key} must be a string.`,
        expected: "string",
        received: typeof options[key],
        repair: `Use a string ${key} or omit it.`,
      });
    }
  }
  return Object.freeze({
    description: options.description ?? null,
    deprecated: options.deprecated ?? null,
  });
}

function resolveTarget(target: unknown): AnyTypeDescriptor {
  const resolved =
    typeof target === "function" ? (target as () => unknown)() : target;
  assertTypeDescriptor(resolved, ["target"]);
  if (resolved.name === null) {
    failDefinition({
      code: "PH-DEF-REFERENCE-TARGET-ANONYMOUS",
      path: ["target"],
      message: "An anonymous input cannot be used as a reference target.",
      repair: "Give the input an explicit name before passing it to ph.ref.",
    });
  }
  return resolved;
}

export function resolveReferenceTarget(
  descriptor: ReferenceDescriptor<any, any, any>,
): AnyTypeDescriptor {
  assertFieldDescriptor(descriptor, ["descriptor"]);
  if ((descriptor as unknown as { readonly kind?: unknown }).kind !== "ref") {
    return failDefinition({
      code: "PH-DEF-REFERENCE-TARGET-INVALID",
      path: ["descriptor"],
      message: "Only a ph.ref descriptor has a reference target.",
      repair: "Pass a descriptor returned by ph.ref(Type).",
    });
  }
  const resolve = referenceResolvers.get(descriptor);
  if (!resolve) {
    return failDefinition({
      code: "PH-DEF-REFERENCE-TARGET-INVALID",
      path: ["descriptor"],
      message: "The reference descriptor has no registered target.",
      repair: "Create references with ph.ref(Type).",
    });
  }
  return resolve();
}

export function toTypeReference(
  descriptor: AnyFieldDescriptor,
): TypeReferenceDefinitionV1 {
  assertFieldDescriptor(descriptor, ["field"]);
  switch (descriptor.kind) {
    case "scalar": {
      const scalarDescriptor = descriptor as ScalarDescriptor<any, any, any>;
      return {
        kind: "scalar",
        name: scalarDescriptor.scalarName,
        required: descriptor.required,
      };
    }
    case "list": {
      const listDescriptor = descriptor as ListDescriptor<any, any, any>;
      return {
        kind: "list",
        required: descriptor.required,
        item: toTypeReference(listDescriptor.item),
      };
    }
    case "ref": {
      const target = resolveReferenceTarget(
        descriptor as ReferenceDescriptor<any, any, any>,
      );
      return {
        kind: "named",
        name: target.name as string,
        required: descriptor.required,
      };
    }
    default:
      return failDefinition({
        code: "PH-DEF-FIELD-INVALID",
        message: "A field descriptor has an unsupported kind.",
        received: String(descriptor.kind),
        repair: "Use a scalar factory, ph.list(...), or ph.ref(Type).",
      });
  }
}

export function toFieldDefinition(
  key: string,
  descriptor: AnyFieldDescriptor,
): FieldDefinitionV1 {
  assertGraphQLName(key, ["fields", key]);
  assertFieldDescriptor(descriptor, ["fields", key]);
  return {
    key,
    name: key,
    description: descriptor.presentation.description,
    deprecated: descriptor.presentation.deprecated,
    type: toTypeReference(descriptor),
  };
}

export function toInputFieldDefinition(
  key: string,
  descriptor: AnyFieldDescriptor,
): InputFieldDefinitionV1 {
  const field = toFieldDefinition(key, descriptor);
  return descriptor.presentation.hasDefaultValue
    ? {
        ...field,
        defaultValue: descriptor.presentation.defaultValue as JsonValue,
      }
    : field;
}

const stringValidator = z.string();
const numberValidator = z.number();

function catalogFactory<
  TName extends Parameters<typeof scalarCatalogFactory>[0],
  TBase,
>(name: TName): ScalarFactory<TName, TBase> {
  return scalarCatalogFactory(name) as ScalarFactory<TName, TBase>;
}

function scalarCatalogFactory(name: keyof typeof scalarFactories) {
  return scalarFactories[name];
}

const PHID = catalogFactory<"PHID", string>("PHID");
const OID = catalogFactory<"OID", string>("OID");
const OLabel = catalogFactory<"OLabel", string>("OLabel");
const Currency = catalogFactory<"Currency", string>("Currency");
const EmailAddress = catalogFactory<"EmailAddress", string>("EmailAddress");
const EthereumAddress = catalogFactory<"EthereumAddress", string>(
  "EthereumAddress",
);
const URLScalar = catalogFactory<"URL", string>("URL");
const DateScalar = catalogFactory<"Date", string>("Date");
const DateTime = catalogFactory<"DateTime", string>("DateTime");
const Money = catalogFactory<"Amount_Money", number>("Amount_Money");
const Percentage = catalogFactory<"Amount_Percentage", number>(
  "Amount_Percentage",
);
const Tokens = catalogFactory<"Amount_Tokens", number>("Amount_Tokens");
const AmountScalar = catalogFactory<"Amount", Amount>("Amount");
const AmountFiat = catalogFactory<"Amount_Fiat", AmountWithNumberValue>(
  "Amount_Fiat",
);
const AmountCrypto = catalogFactory<"Amount_Crypto", AmountWithStringValue>(
  "Amount_Crypto",
);
const AmountCurrency = catalogFactory<"Amount_Currency", AmountWithStringValue>(
  "Amount_Currency",
);
const AddressScalar = catalogFactory<"Address", Address>("Address");
const AttachmentRefScalar = catalogFactory<"AttachmentRef", AttachmentRef>(
  "AttachmentRef",
);
const Unknown = catalogFactory<"Unknown", unknown>("Unknown");
const Upload = catalogFactory<"Upload", unknown>("Upload");
const JSONObject = catalogFactory<
  "JSONObject",
  Readonly<Record<string, unknown>>
>("JSONObject");

export function isComputedFieldToken(
  value: unknown,
): value is ComputedFieldToken {
  return (
    value !== null &&
    typeof value === "object" &&
    computedFieldTokens.has(value)
  );
}

export const ph = Object.freeze({
  ID<const TRequired extends boolean = false>(
    options?: FieldOptions<TRequired>,
  ) {
    return scalar("ID", stringValidator, options);
  },
  String<const TRequired extends boolean = false>(
    options?: FieldOptions<TRequired>,
  ) {
    return scalar("String", stringValidator, options);
  },
  Boolean<const TRequired extends boolean = false>(
    options?: FieldOptions<TRequired>,
  ) {
    return scalar("Boolean", z.boolean(), options);
  },
  Int<const TRequired extends boolean = false>(
    options?: FieldOptions<TRequired>,
  ) {
    return scalar("Int", z.number().int(), options);
  },
  Float<const TRequired extends boolean = false>(
    options?: FieldOptions<TRequired>,
  ) {
    return scalar("Float", numberValidator, options);
  },
  PHID,
  OID,
  OLabel,
  Currency,
  EmailAddress,
  EthereumAddress,
  URL: URLScalar,
  Date: DateScalar,
  DateTime,
  Money,
  Percentage,
  Tokens,
  Amount: AmountScalar,
  AmountFiat,
  AmountCrypto,
  AmountCurrency,
  Address: AddressScalar,
  AttachmentRef: AttachmentRefScalar,
  Unknown,
  Upload,
  JSONObject,
  field<
    const TReturns extends AnyFieldDescriptor,
    const TArgs extends ObjectFields = Record<never, never>,
  >(
    options: ComputedFieldOptions<TArgs, TReturns>,
  ): ComputedFieldDescriptor<TArgs, TReturns> {
    const config = snapshotRecord(
      options,
      new Set(["args", "returns", "description", "deprecated"]),
      ["options"],
    );
    assertFieldDescriptor(config.returns, ["options", "returns"]);
    const args = assertFields(config.args ?? {}, ["options", "args"]) as TArgs;
    const descriptor = Object.freeze({
      kind: "computed-field",
      args,
      returns: config.returns as TReturns,
      presentation: computedPresentation(
        config as ComputedFieldOptions<ObjectFields, AnyFieldDescriptor>,
      ),
    });
    computedFieldDescriptors.add(descriptor);
    return descriptor;
  },
  enum<const TValues extends readonly string[]>(
    name: string,
    options: EnumOptions<TValues> | TValues,
  ): EnumDescriptor<TValues> {
    const validName = assertGraphQLName(name, ["name"]);
    const directValues = snapshotArray(options, ["options"]);
    const config = (
      directValues
        ? { values: directValues }
        : snapshotRecord(options, new Set(["values", "description"]), [
            "options",
          ])
    ) as EnumOptions<TValues>;
    const rawValues = snapshotArray(config.values, ["options", "values"]);
    if (!rawValues || rawValues.length === 0) {
      failDefinition({
        code: "PH-DEF-ENUM-EMPTY",
        path: ["options", "values"],
        message: "An enum must declare at least one value.",
        repair: "Add one or more unique GraphQL enum values.",
      });
    }
    const seen = new Set<string>();
    for (let index = 0; index < rawValues.length; index += 1) {
      const value = assertGraphQLName(rawValues[index], [
        "options",
        "values",
        String(index),
      ]);
      if (seen.has(value)) {
        failDefinition({
          code: "PH-DEF-ENUM-VALUE-DUPLICATE",
          path: ["options", "values", index],
          message: `Enum value ${JSON.stringify(value)} is declared more than once.`,
          repair: "Keep one declaration for each enum value.",
        });
      }
      seen.add(value);
    }
    const values = rawValues as unknown as TValues;
    const description = descriptionFrom(config);
    return registerTypeDescriptor(
      Object.freeze({
        kind: "enum",
        role: "named type; wrap it with ph.ref(Type) to use it as a field",
        identity: namedIdentity("enum", validName, description),
        name: validName,
        description,
        values,
        validator: z.enum(values as unknown as readonly [string, ...string[]]),
      }) as EnumDescriptor<TValues>,
    );
  },
  interface<const TFields extends ObjectFields>(
    name: string,
    options: InterfaceOptions<TFields>,
  ): InterfaceDescriptor<TFields> {
    const validName = assertGraphQLName(name, ["name"]);
    const config = snapshotRecord(options, new Set(["fields", "description"]), [
      "options",
    ]) as InterfaceOptions<TFields>;
    const fields = assertFields(config.fields, [
      "options",
      "fields",
    ]) as TFields;
    const description = descriptionFrom(config);
    return registerTypeDescriptor(
      Object.freeze({
        kind: "interface",
        role: "named type; wrap it with ph.ref(Type) to use it as a field",
        identity: namedIdentity("interface", validName, description),
        name: validName,
        description,
        fields,
        validator: objectValidator(fields),
      }) as InterfaceDescriptor<TFields>,
    );
  },
  object<
    const TMembers extends ObjectMembers,
    const TImplements extends readonly InterfaceDescriptor[] = readonly [],
  >(
    name: string,
    options: ObjectOptions<TMembers, TImplements>,
  ): ObjectDescriptor<TMembers, TImplements> {
    const validName = assertGraphQLName(name, ["name"]);
    const config = snapshotRecord(
      options,
      new Set(["fields", "description", "implements"]),
      ["options"],
    ) as ObjectOptions<TMembers, TImplements>;
    const members = snapshotFieldMembers(
      config.fields,
      ["options", "fields"],
      true,
    );
    const implementedSnapshot =
      config.implements === undefined
        ? Object.freeze([])
        : snapshotArray(config.implements, ["options", "implements"]);
    if (!implementedSnapshot) {
      failDefinition({
        code: "PH-DEF-IMPLEMENTS-TARGET-INVALID",
        path: ["options", "implements"],
        message: "Object implementations must be an array of interfaces.",
        repair: "Pass an array of descriptors returned by ph.interface.",
      });
    }
    const implemented = implementedSnapshot as readonly InterfaceDescriptor[];
    const implementedNames = new Set<string>();
    implemented.forEach((descriptor, index) => {
      assertTypeDescriptor(descriptor, ["options", "implements", index]);
      if (
        (descriptor as unknown as { readonly kind?: unknown }).kind !==
        "interface"
      ) {
        failDefinition({
          code: "PH-DEF-IMPLEMENTS-TARGET-INVALID",
          path: ["options", "implements", index],
          message: "An object can implement only interface descriptors.",
          repair: "Pass a descriptor returned by ph.interface.",
        });
      }
      const implementedName = descriptor.name as string;
      if (implementedNames.has(implementedName)) {
        failDefinition({
          code: "PH-DEF-IMPLEMENTS-DUPLICATE",
          path: ["options", "implements", index],
          message: `Interface ${JSON.stringify(implementedName)} is implemented more than once.`,
          repair: "Keep one occurrence of each implemented interface.",
        });
      }
      implementedNames.add(implementedName);
    });
    const description = descriptionFrom(config);
    const fields = members.stored;
    const computedTokens = Object.freeze(
      Object.fromEntries(
        Object.entries(members.computed).map(([key, field]) => {
          const token = Object.freeze({
            kind: "computed-field-token",
            objectName: validName,
            key,
            args: field.args,
            returns: field.returns,
            presentation: field.presentation,
          });
          computedFieldTokens.add(token);
          return [key, token];
        }),
      ),
    );
    return registerTypeDescriptor(
      Object.freeze({
        kind: "object",
        role: "named type; wrap it with ph.ref(Type) to use it as a field",
        identity: namedIdentity("object", validName, description),
        name: validName,
        description,
        fields,
        computed: computedTokens,
        implements: implemented,
        memberOrder: members.order,
        validator: objectValidator(fields),
      }) as unknown as ObjectDescriptor<TMembers, TImplements>,
    );
  },
  input<const TFields extends ObjectFields>(
    nameOrOptions: string | InputOptions<TFields>,
    maybeOptions?: InputOptions<TFields>,
  ): InputDescriptor<TFields> {
    const name =
      typeof nameOrOptions === "string"
        ? assertGraphQLName(nameOrOptions, ["name"])
        : null;
    const options =
      typeof nameOrOptions === "string" ? maybeOptions : nameOrOptions;
    const config = snapshotRecord(options, new Set(["fields", "description"]), [
      "options",
    ]) as InputOptions<TFields>;
    const fields = assertFields(config.fields, [
      "options",
      "fields",
    ]) as TFields;
    const description = descriptionFrom(config);
    return registerTypeDescriptor(
      Object.freeze({
        kind: "input",
        role: "named type; wrap it with ph.ref(Type) to use it as a field",
        identity: namedIdentity("input", name, description),
        name,
        description,
        fields,
        validator: objectValidator(fields),
      }) as InputDescriptor<TFields>,
    );
  },
  union<const TMembers extends readonly ObjectDescriptor[]>(
    name: string,
    options: UnionOptions<TMembers>,
  ): UnionDescriptor<TMembers> {
    const validName = assertGraphQLName(name, ["name"]);
    const config = snapshotRecord(
      options,
      new Set(["members", "description"]),
      ["options"],
    ) as UnionOptions<TMembers>;
    const memberSnapshot = snapshotArray(config.members, [
      "options",
      "members",
    ]);
    if (!memberSnapshot || memberSnapshot.length === 0) {
      failDefinition({
        code: "PH-DEF-UNION-EMPTY",
        path: ["options", "members"],
        message: "A union must declare at least one object member.",
        repair: "Add one or more unique ph.object descriptors.",
      });
    }
    const seen = new Set<string>();
    memberSnapshot.forEach((member, index) => {
      assertTypeDescriptor(member, ["options", "members", index]);
      if (
        (member as unknown as { readonly kind?: unknown }).kind !== "object"
      ) {
        failDefinition({
          code: "PH-DEF-UNION-MEMBER-INVALID",
          path: ["options", "members", index],
          message: "A GraphQL union member must be an object descriptor.",
          repair: "Replace the member with a descriptor returned by ph.object.",
        });
      }
      if (seen.has(member.name as string)) {
        failDefinition({
          code: "PH-DEF-UNION-MEMBER-DUPLICATE",
          path: ["options", "members", index],
          message: `Union member ${JSON.stringify(member.name)} is declared more than once.`,
          repair: "Keep one occurrence of each union member.",
        });
      }
      seen.add(member.name as string);
    });
    const members = memberSnapshot as unknown as TMembers;
    const description = descriptionFrom(config);
    const validator = z.custom<OutputOf<TMembers[number]>>((value) =>
      members.some((member) => member.validator.safeParse(value).success),
    );
    return registerTypeDescriptor(
      Object.freeze({
        kind: "union",
        role: "named type; wrap it with ph.ref(Type) to use it as a field",
        identity: namedIdentity("union", validName, description),
        name: validName,
        description,
        members,
        validator,
      }) as UnionDescriptor<TMembers>,
    );
  },
  ref<
    const TDescriptor extends TypeDescriptor<any, any, any>,
    const TRequired extends boolean = false,
  >(
    target: TDescriptor | (() => TDescriptor),
    options?: FieldOptions<TRequired>,
  ): ReferenceDescriptor<
    Nullable<
      TDescriptor extends TypeDescriptor<infer TInput, any, any>
        ? TInput
        : never,
      TRequired
    >,
    Nullable<OutputOf<TDescriptor>, TRequired>,
    Nullable<SourceOf<TDescriptor>, TRequired>,
    TRequired
  > {
    let resolved: AnyTypeDescriptor | undefined;
    if (typeof target !== "function") {
      assertTypeDescriptor(target, ["target"]);
      resolved = resolveTarget(target);
    }
    const resolve = (): AnyTypeDescriptor => {
      if (resolved !== undefined) return resolved;
      const candidate = resolveTarget(target);
      resolved = candidate;
      return candidate;
    };
    const { required, presentation } = fieldPresentation(options);
    const validator = z.lazy(() => resolve().validator);
    const descriptor = registerFieldDescriptor(
      Object.freeze({
        kind: "ref",
        role: "field use",
        identity: Object.freeze({ kind: "ref", required }),
        target,
        required,
        presentation,
        validator: required ? validator : validator.nullish(),
      }) as ReferenceDescriptor<any, any, any, TRequired>,
    );
    referenceResolvers.set(descriptor, resolve);
    return descriptor;
  },
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
    assertFieldDescriptor(item, ["item"]);
    const { required, presentation } = fieldPresentation(options);
    const validator = z.array(item.validator);
    return registerFieldDescriptor(
      Object.freeze({
        kind: "list",
        role: "field use",
        identity: Object.freeze({ kind: "list", required }),
        item,
        required,
        presentation,
        validator: required ? validator : validator.nullish(),
      }) as ListDescriptor<any, any, any, TRequired>,
    );
  },
});

export function nameAnonymousInput<TFields extends ObjectFields>(
  descriptor: InputDescriptor<TFields>,
  name: string,
): InputDescriptor<TFields> {
  assertTypeDescriptor(descriptor, ["descriptor"]);
  if ((descriptor as unknown as { readonly kind?: unknown }).kind !== "input") {
    return failDefinition({
      code: "PH-DEF-REFERENCE-TARGET-INVALID",
      path: ["descriptor"],
      message: "Only a ph.input descriptor can receive a contextual name.",
      repair: "Pass an anonymous descriptor returned by ph.input(...).",
    });
  }
  if (descriptor.name !== null) return descriptor;
  const validName = assertGraphQLName(name, ["name"]);
  return registerTypeDescriptor(
    Object.freeze({
      ...descriptor,
      name: validName,
      identity: namedIdentity("input", validName, descriptor.description),
    }),
  );
}

export { isFieldDescriptor, isTypeDescriptor };

export function hasAuthoredDefaultValue(
  descriptor: AnyFieldDescriptor,
): boolean {
  return descriptor.presentation.hasDefaultValue;
}
