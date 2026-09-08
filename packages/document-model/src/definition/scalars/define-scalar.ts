import type {
  JsonValue,
  PowerhouseScalarNameV1,
  ScalarDefinitionV1,
  ScalarVectorValueV1,
} from "@powerhousedao/shared/document-model";
import { snapshotDataRecord } from "../data-properties.js";
import { failDefinition } from "../diagnostics.js";
import { registerFieldDescriptor } from "../descriptor-registry.js";
import {
  assertJsonValue,
  canonicalJson,
  isGraphQLName,
  isRecord,
  sha256,
} from "../primitives.js";
import type { ScalarDescriptor } from "../types.js";
import type {
  BuiltScalar,
  ScalarCoercion,
  ScalarDeclaration,
  ScalarFactory,
  ScalarValidationOptions,
} from "./types.js";
import { scalarLiteralValue } from "./scalar-literal.js";

type Nullable<T, TRequired extends boolean> = TRequired extends true
  ? T
  : T | null | undefined;

function materializeVectorValue(value: ScalarVectorValueV1): unknown {
  if (value.kind === "json") return value.value;
  switch (value.tag) {
    case "undefined":
      return undefined;
    case "bigint":
      return BigInt(value.decimal);
    case "date":
      return new Date(value.iso);
    case "map":
      return new Map(value.entries);
    case "upload":
      return Object.freeze({ fixtureId: value.fixtureId, kind: "upload" });
  }
}

function deriveCoercion<TBase>(
  declaration: ScalarDeclaration<PowerhouseScalarNameV1, TBase>,
): ScalarCoercion<TBase> {
  const parseValue = (input: unknown): TBase =>
    declaration.validator.parse(input);
  return {
    parseValue,
    parseLiteral(node) {
      if (
        (declaration.representation === "string" && node.kind !== "string") ||
        (declaration.representation === "number" &&
          node.kind !== "int" &&
          node.kind !== "float") ||
        (declaration.representation === "boolean" && node.kind !== "boolean") ||
        (declaration.representation === "json-object" && node.kind !== "object")
      ) {
        throw new TypeError(
          `${declaration.name} cannot coerce a ${node.kind} literal.`,
        );
      }
      return parseValue(scalarLiteralValue(node));
    },
    serialize: parseValue,
  };
}

function assertVector(
  declaration: ScalarDeclaration<PowerhouseScalarNameV1, unknown>,
): void {
  if (
    !Array.isArray(declaration.accepts) ||
    !Array.isArray(declaration.rejects)
  ) {
    failDefinition({
      code: "PH-SCALAR-VECTOR-EMPTY",
      path: ["vector"],
      message: `Scalar ${declaration.name} must declare accept and reject vectors as arrays.`,
      repair: "Provide nonempty accepts and rejects arrays.",
    });
  }
  if (declaration.accepts.length === 0 || declaration.rejects.length === 0) {
    failDefinition({
      code: "PH-SCALAR-VECTOR-EMPTY",
      path: ["vector"],
      message: `Scalar ${declaration.name} must declare nonempty accept and reject vectors.`,
      repair:
        "Add stable accept and reject cases that cover the compatibility profile.",
    });
  }
  const caseIds = new Set<string>();
  for (const [partition, cases] of [
    ["accepts", declaration.accepts],
    ["rejects", declaration.rejects],
  ] as const) {
    cases.forEach((entry, index) => {
      if (
        !isRecord(entry) ||
        typeof entry.id !== "string" ||
        !isRecord(entry.input)
      ) {
        failDefinition({
          code: "PH-SCALAR-VECTOR-ID-INVALID",
          path: ["vector", partition, index],
          message: "A scalar vector case must contain a string id and input.",
          repair: "Use { id, input } for every scalar vector case.",
        });
      }
      if (entry.id === "" || caseIds.has(entry.id)) {
        failDefinition({
          code: "PH-SCALAR-VECTOR-ID-INVALID",
          path: ["vector", partition, index, "id"],
          message: `Scalar vector case ID ${JSON.stringify(entry.id)} is empty or duplicated.`,
          repair: "Give every scalar vector case a unique nonempty ID.",
        });
      }
      caseIds.add(entry.id);
      if (entry.input.kind === "json") {
        assertJsonValue(
          entry.input.value,
          `$.${partition}[${index}].input.value`,
        );
      } else {
        materializeVectorValue(entry.input);
      }
    });
  }
}

function assertZero<TBase>(
  declaration: ScalarDeclaration<PowerhouseScalarNameV1, TBase>,
): void {
  if (!isRecord(declaration.zero)) {
    failDefinition({
      code: "PH-SCALAR-ZERO-VALUE-INVALID",
      path: ["zero"],
      message: `Scalar ${declaration.name} must declare a zero-value policy.`,
      repair: "Use zero.kind value or zero.kind none with a reason.",
    });
  }
  if (declaration.zero.kind === "none") {
    if (!declaration.zero.reason) {
      failDefinition({
        code: "PH-SCALAR-ZERO-VALUE-INVALID",
        path: ["zero", "reason"],
        message: `Scalar ${declaration.name} has no zero-value reason.`,
        repair:
          "Explain why the scalar has no meaningful compatible zero value.",
      });
    }
    return;
  }
  assertJsonValue(declaration.zero.value, "$.zero.value");
  if (!declaration.validator.safeParse(declaration.zero.value).success) {
    failDefinition({
      code: "PH-SCALAR-ZERO-VALUE-INVALID",
      path: ["zero", "value"],
      message: `Scalar ${declaration.name} rejects its declared zero value.`,
      repair:
        "Declare a value accepted by the scalar validator or use zero.kind none.",
    });
  }
}

function makeFactory<TName extends PowerhouseScalarNameV1, TBase>(
  declaration: ScalarDeclaration<TName, TBase>,
  definition: ScalarDefinitionV1 & { readonly name: TName },
): ScalarFactory<TName, TBase> {
  function factory<const TRequired extends boolean = false>(
    options?: ScalarValidationOptions<TRequired>,
  ): ScalarDescriptor<
    Nullable<TBase, TRequired>,
    Nullable<TBase, TRequired>,
    Nullable<TBase, TRequired>,
    TRequired
  > {
    let optionsSnapshot: Readonly<Record<string, unknown>> | undefined;
    if (options !== undefined) {
      const inspected = snapshotDataRecord(options);
      if (!inspected.ok) {
        failDefinition({
          code: "PH-DEF-OBJECT-EXPECTED",
          path:
            inspected.key === undefined
              ? ["options"]
              : [
                  "options",
                  typeof inspected.key === "number"
                    ? inspected.key
                    : String(inspected.key),
                ],
          message:
            "A descriptor configuration must contain stable plain data properties.",
          repair:
            "Pass a plain object without accessors, proxies, or custom prototypes.",
        });
      }
      optionsSnapshot = inspected.value;
      for (const key of Object.keys(optionsSnapshot)) {
        if (key !== "required") {
          failDefinition({
            code: "PH-DEF-FIELD-OPTION-UNSUPPORTED",
            path: ["options", key],
            message: `Field option ${String(key)} is not supported.`,
            repair:
              "Remove the option and enforce domain validation in the reducer or resolver.",
          });
        }
      }
    }
    const required = (optionsSnapshot?.required ?? false) as TRequired;
    if (typeof required !== "boolean") {
      failDefinition({
        code: "PH-DEF-FIELD-OPTION-INVALID",
        path: ["options", "required"],
        message: "Field option required must be a boolean.",
        repair: "Use required: true, required: false, or omit the option.",
      });
    }
    const validator = required
      ? declaration.validator
      : declaration.validator.nullish();
    return registerFieldDescriptor(
      Object.freeze({
        kind: "scalar",
        role: "field use",
        identity: Object.freeze({
          kind: "scalar",
          name: declaration.name,
          required,
        }),
        scalarName: declaration.name,
        required,
        presentation: Object.freeze({
          description: null,
          deprecated: null,
          hasDefaultValue: false,
        }),
        validator,
      }) as ScalarDescriptor<any, any, any, TRequired>,
    );
  }

  return Object.freeze(
    Object.assign(factory, {
      role: `field-use factory; call it, as ph.${declaration.name}({ required: true })` as const,
      kind: "scalar-factory" as const,
      declaration: definition,
    }),
  );
}

export function defineScalar<const TName extends PowerhouseScalarNameV1, TBase>(
  declarationValue: ScalarDeclaration<TName, TBase>,
): BuiltScalar<TName, TBase> {
  const inspectedDeclaration = snapshotDataRecord(declarationValue);
  if (!inspectedDeclaration.ok) {
    failDefinition({
      code: "PH-SCALAR-DECLARATION-INVALID",
      path:
        inspectedDeclaration.key === undefined
          ? []
          : [
              typeof inspectedDeclaration.key === "number"
                ? inspectedDeclaration.key
                : String(inspectedDeclaration.key),
            ],
      message:
        "A scalar declaration must contain stable plain data properties.",
      repair:
        "Pass the documented plain declaration object without accessors or proxies.",
    });
  }
  const declaration = inspectedDeclaration.value as ScalarDeclaration<
    TName,
    TBase
  >;
  if (!isGraphQLName(declaration.name)) {
    failDefinition({
      code: "PH-SCALAR-NAME-INVALID",
      path: ["name"],
      message: `Scalar name ${JSON.stringify(declaration.name)} is not a valid author-defined GraphQL name.`,
      repair: "Use the registered SDL scalar name.",
    });
  }
  if (
    typeof declaration.description !== "string" ||
    declaration.description === ""
  ) {
    failDefinition({
      code: "PH-SCALAR-DESCRIPTION-MISSING",
      path: ["description"],
      message: `Scalar ${declaration.name} must have a description.`,
      repair: "Add a concise description of the scalar's represented value.",
    });
  }
  if (
    !isRecord(declaration.validator) ||
    typeof declaration.validator.parse !== "function" ||
    typeof declaration.validator.safeParse !== "function" ||
    typeof declaration.validator.nullish !== "function"
  ) {
    failDefinition({
      code: "PH-SCALAR-DECLARATION-INVALID",
      path: ["validator"],
      message: `Scalar ${declaration.name} must provide a Zod validator.`,
      repair: "Provide a validator with parse, safeParse, and nullish methods.",
    });
  }
  if (
    declaration.coercion !== "derive" &&
    (!isRecord(declaration.coercion) ||
      typeof declaration.coercion.parseValue !== "function" ||
      typeof declaration.coercion.parseLiteral !== "function" ||
      typeof declaration.coercion.serialize !== "function")
  ) {
    failDefinition({
      code: "PH-SCALAR-DECLARATION-INVALID",
      path: ["coercion"],
      message: `Scalar ${declaration.name} must derive coercion or provide all coercion functions.`,
      repair:
        "Use coercion: derive or provide parseValue, parseLiteral, and serialize.",
    });
  }
  if (
    declaration.exemption !== undefined &&
    (!isRecord(declaration.exemption) ||
      !Array.isArray(declaration.exemption.paths) ||
      !Array.isArray(declaration.exemption.caseIds))
  ) {
    failDefinition({
      code: "PH-SCALAR-DECLARATION-INVALID",
      path: ["exemption"],
      message: `Scalar ${declaration.name} has an invalid exemption declaration.`,
      repair:
        "Provide exemption paths and caseIds as arrays or omit exemption.",
    });
  }
  assertVector(
    declaration as ScalarDeclaration<PowerhouseScalarNameV1, unknown>,
  );
  assertZero(declaration as ScalarDeclaration<PowerhouseScalarNameV1, TBase>);

  const accepts = Object.freeze([...declaration.accepts]);
  const rejects = Object.freeze([...declaration.rejects]);
  const exemption = declaration.exemption
    ? Object.freeze({
        ...declaration.exemption,
        paths: Object.freeze([...declaration.exemption.paths]),
        caseIds: Object.freeze([...declaration.exemption.caseIds]),
        digest: sha256(
          canonicalJson({
            name: declaration.name,
            profile: declaration.exemption.profile,
            paths: declaration.exemption.paths,
            caseIds: declaration.exemption.caseIds,
          }),
        ),
      })
    : null;
  const definition = Object.freeze({
    kind: "powerhouse.scalar" as const,
    formatVersion: 1 as const,
    name: declaration.name,
    representation: declaration.representation,
    persistable: declaration.persistable,
    description: declaration.description,
    zero: declaration.zero,
    coercion: Object.freeze({
      source:
        declaration.coercion === "derive"
          ? ("derived" as const)
          : ("explicit" as const),
      exemption,
    }),
    vector: Object.freeze({
      accepts,
      rejects,
      acceptanceDigest: sha256(
        canonicalJson({ accepts, rejects } as unknown as JsonValue),
      ),
    }),
    coercionProfile: declaration.coercionProfile,
  }) satisfies ScalarDefinitionV1 & { readonly name: TName };
  const coercion =
    declaration.coercion === "derive"
      ? deriveCoercion(
          declaration as ScalarDeclaration<PowerhouseScalarNameV1, TBase>,
        )
      : declaration.coercion;
  const binding = Object.freeze({
    definition,
    validationProfile: declaration.coercionProfile,
    validator: declaration.validator,
    coercion: coercion as ScalarCoercion<unknown>,
    typescriptType: declaration.typescriptType,
    zodSource: declaration.zodSource,
    typedef: `scalar ${declaration.name}` as const,
  });
  return Object.freeze({
    declaration,
    definition,
    factory: makeFactory(declaration, definition),
    binding,
  });
}
