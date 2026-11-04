import type {
  DocumentModelSpecificationDefinition,
  InputFieldDefinition,
  InputTypeDefinition,
  NamedGraphQLTypeDefinition,
  TypeReferenceDefinition,
} from "@powerhousedao/shared/document-model";
import { catalogScalarCases } from "../scalars/catalog-cases.js";

export type ValidatorSample = {
  readonly operation: string;
  readonly inputType: string;
  readonly label: string;
  readonly input: unknown;
};

type Types = ReadonlyMap<string, NamedGraphQLTypeDefinition>;

const BUILT_IN: Readonly<Record<string, { valid: unknown; wrong: unknown }>> = {
  String: { valid: "text", wrong: 42 },
  ID: { valid: "id-1", wrong: 42 },
  Boolean: { valid: true, wrong: "true" },
  Int: { valid: 1, wrong: "1" },
  Float: { valid: 1.5, wrong: "1.5" },
};

function catalogCase(name: string) {
  if (!Object.hasOwn(catalogScalarCases, name)) {
    throw new Error(`No catalog cases for ${name}.`);
  }
  const cases = catalogScalarCases[name];
  return {
    valid: cases.accepts[0],
    invalid: cases.rejects.find((value) => typeof value === "string"),
  };
}

function validValue(type: TypeReferenceDefinition, types: Types): unknown {
  if (type.kind === "list") return [validValue(type.item, types)];
  if (type.kind === "scalar") {
    return (BUILT_IN[type.name] ?? catalogCase(type.name)).valid;
  }
  const named = types.get(type.name);
  if (named?.kind === "enum") return named.values[0]?.name;
  if (named?.kind === "input") return validObject(named, types);
  throw new Error(`${type.name} is not an input or enum type.`);
}

function validObject(input: InputTypeDefinition, types: Types) {
  return Object.fromEntries(
    input.fields.map((field) => [field.name, validValue(field.type, types)]),
  );
}

function wrongValue(type: TypeReferenceDefinition, types: Types): unknown {
  if (type.kind === "list") return "not a list";
  if (type.kind === "scalar") return BUILT_IN[type.name]?.wrong ?? 42;
  return types.get(type.name)?.kind === "enum"
    ? "NOT_A_MEMBER"
    : "not an object";
}

function invalidCatalogValue(type: TypeReferenceDefinition): unknown {
  if (type.kind === "list") {
    const item = invalidCatalogValue(type.item);
    return item === undefined ? undefined : [item];
  }
  if (type.kind !== "scalar" || type.name in BUILT_IN) return undefined;
  return catalogCase(type.name).invalid;
}

function fieldSamples(
  valid: Readonly<Record<string, unknown>>,
  field: InputFieldDefinition,
  types: Types,
): [string, unknown][] {
  const { [field.name]: _omitted, ...missing } = valid;
  const invalid = invalidCatalogValue(field.type);
  return [
    [`${field.name}: missing`, missing],
    [`${field.name}: null`, { ...valid, [field.name]: null }],
    [
      `${field.name}: wrong type`,
      { ...valid, [field.name]: wrongValue(field.type, types) },
    ],
    ...(invalid === undefined
      ? []
      : ([
          [
            `${field.name}: invalid scalar`,
            { ...valid, [field.name]: invalid },
          ],
        ] as [string, unknown][])),
  ];
}

export function validatorSamples(
  specification: DocumentModelSpecificationDefinition,
): ValidatorSample[] {
  const inputs = specification.modules.flatMap((module) =>
    module.operations.flatMap(({ input }) => (input === null ? [] : [input])),
  );
  const types: Types = new Map(
    [...specification.types, ...inputs].map((type) => [type.name, type]),
  );
  return specification.modules.flatMap((module) =>
    module.operations.flatMap(({ creatorKey, input, examples }) => {
      if (input === null) return [];
      const valid = (
        examples.length === 0
          ? validObject(input, types)
          : JSON.parse(examples[0].value)
      ) as Record<string, unknown>;
      const samples: [string, unknown][] = [
        ["valid", valid],
        ...input.fields.flatMap((field) => fieldSamples(valid, field, types)),
        ["unknown key", { ...valid, unknownKey: "x" }],
      ];
      return samples.map(([label, sample]) => ({
        operation: creatorKey,
        inputType: input.name,
        label,
        input: sample,
      }));
    }),
  );
}
