import { dslDiagnostics } from "./diagnostic-codes.js";
import type { PowerhouseScalarName } from "@powerhousedao/shared/document-model";
import { z } from "zod";
import {
  type CatalogScalarDefinition,
  documentModelScalars,
  scalarCatalog,
} from "../../scalars/catalog.js";
import {
  isScalarDefinition,
  SCALAR_DEFINITION_VERSION,
  type ScalarDefinition,
  scalarDefinitionVersion,
  type ScalarValue,
} from "../../scalars/types.js";
import { describeReceived } from "../kernel/diagnostics.js";
import { registerScalarFactory } from "./descriptor-registry.js";
import { createScalarField } from "./field-options.js";
import type {
  DefaultFlag,
  JsonLiteral,
  Nullable,
  ScalarBuilder,
  ScalarBuilderOptions,
  ScalarDescriptor,
} from "./types.js";

const BUILDER_NAMES = {
  Amount_Money: "Money",
  Amount_Percentage: "Percentage",
  Amount_Tokens: "Tokens",
  Amount_Fiat: "AmountFiat",
  Amount_Crypto: "AmountCrypto",
  Amount_Currency: "AmountCurrency",
} as const satisfies Partial<Record<PowerhouseScalarName, string>>;

type BuilderName<TName extends string> =
  TName extends keyof typeof BUILDER_NAMES
    ? (typeof BUILDER_NAMES)[TName]
    : TName;

function builderName(name: string): string {
  return Object.hasOwn(BUILDER_NAMES, name)
    ? BUILDER_NAMES[name as keyof typeof BUILDER_NAMES]
    : name;
}

type ScalarFactory<TValue, TCall extends string> = ScalarBuilder<TValue> & {
  readonly role: `field-use factory; call it, as ${TCall}({ required: true })`;
  readonly kind: "scalar-factory";
};

function scalarFactory<TValue, TCall extends string>(
  call: TCall,
  name: string,
  validator: z.ZodType,
  definition?: ScalarDefinition,
): ScalarFactory<TValue, TCall> {
  const factory = (options?: ScalarBuilderOptions) =>
    createScalarField(name, validator, options, definition);
  return registerScalarFactory(
    Object.freeze(
      Object.assign(factory, {
        role: `field-use factory; call it, as ${call}({ required: true })` as const,
        kind: "scalar-factory" as const,
      }),
    ),
  ) as unknown as ScalarFactory<TValue, TCall>;
}

export const builtInScalarFactories = {
  ID: scalarFactory<string, "ph.ID">("ph.ID", "ID", z.string()),
  String: scalarFactory<string, "ph.String">("ph.String", "String", z.string()),
  Boolean: scalarFactory<boolean, "ph.Boolean">(
    "ph.Boolean",
    "Boolean",
    z.boolean(),
  ),
  Int: scalarFactory<number, "ph.Int">("ph.Int", "Int", z.number()),
  Float: scalarFactory<number, "ph.Float">("ph.Float", "Float", z.number()),
};

type CatalogScalarFactories = {
  readonly [
    S in CatalogScalarDefinition as S["name"] extends PowerhouseScalarName
      ? BuilderName<S["name"]>
      : never
  ]: ScalarFactory<ScalarValue<S>, `ph.${BuilderName<S["name"]>}`>;
};

export const catalogScalarFactories = Object.fromEntries(
  documentModelScalars.map((definition) => {
    const builder = builderName(definition.name);
    return [
      builder,
      scalarFactory(
        `ph.${builder}`,
        definition.name,
        definition.schema,
        definition,
      ),
    ];
  }),
) as CatalogScalarFactories;

const modelScalarNames = new Set(
  documentModelScalars.map((definition) => definition.name),
);
const hostOnlyScalars: ReadonlySet<string> = new Set(
  scalarCatalog
    .map((definition) => definition.name)
    .filter((name) => !modelScalarNames.has(name)),
);

export function scalarField<
  TName extends string,
  TValue,
  const TRequired extends boolean = false,
  const TDefault extends JsonLiteral | undefined = undefined,
>(
  definition: ScalarDefinition<TName, TValue>,
  options?: ScalarBuilderOptions<TRequired, TDefault>,
): ScalarDescriptor<
  Nullable<TValue, TRequired>,
  Nullable<TValue, TRequired>,
  Nullable<TValue, TRequired>,
  TRequired,
  DefaultFlag<TDefault>
> {
  if (!isScalarDefinition(definition)) refuseScalarDefinition(definition);
  if (hostOnlyScalars.has(definition.name)) {
    dslDiagnostics.fail({
      code: "PH-SCALAR-INTERNAL",
      definition: { kind: "scalar", key: definition.name },
      path: ["definition"],
      message: `${definition.name} is internal to the reactor host. A document model cannot use it.`,
      received: definition.name,
      repair:
        "Use ph.Unknown() for an unconstrained value, or ph.object(...) for a structured one.",
    });
  }
  return createScalarField(
    definition.name,
    definition.schema,
    options,
    definition,
  );
}

const EXPECTED_DEFINITION =
  "a ScalarDefinition from defineScalar in document-model/scalars";

function refuseScalarDefinition(value: unknown): never {
  const version = scalarDefinitionVersion(value);
  if (version === undefined) {
    return dslDiagnostics.fail({
      code: "PH-SCALAR-DEFINITION-INVALID",
      path: ["definition"],
      message: "ph.scalar takes a scalar definition returned by defineScalar.",
      expected: EXPECTED_DEFINITION,
      received: describeReceived(value),
      repair:
        "Pass the value defineScalar returned, or use a ph.<Scalar>() factory for a catalog scalar.",
    });
  }
  const received =
    typeof version === "number" ? String(version) : describeReceived(version);
  return dslDiagnostics.fail({
    code: "PH-SCALAR-DEFINITION-INVALID",
    path: ["definition"],
    message: `The scalar definition has format version ${received}; this release reads version ${SCALAR_DEFINITION_VERSION}.`,
    expected: EXPECTED_DEFINITION,
    received,
    repair:
      "Install the same document-model release in the package that defines the scalar and the package that uses it.",
  });
}
