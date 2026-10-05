import type {
  ScalarRepresentation,
  ScalarZero,
} from "@powerhousedao/shared/document-model";
import type { z } from "zod";
import { snapshotRecord } from "../data-properties.js";
import {
  type DefinitionDiagnosticInput,
  DocumentModelDefinitionError,
  createDiagnostic,
} from "../diagnostics.js";
import { canonicalJson, isAuthoredSchemaName } from "../primitives.js";
import type { ScalarLiteralNode } from "./scalar-literal.js";

export const PROFILE = "document-engineering-1.40" as const;

/** The GraphQL coercion of a scalar: variables, inline literals, and output. */
export type ScalarCoercion<TBase> = {
  readonly parseValue: (input: unknown) => TBase;
  readonly parseLiteral: (node: ScalarLiteralNode) => TBase;
  readonly serialize: (value: unknown) => unknown;
};

export type ScalarDeclaration<
  TName extends string = string,
  TBuilderName extends string = string,
  TRepresentation extends ScalarRepresentation = ScalarRepresentation,
  TBase = unknown,
  TInput = TBase,
> = {
  /** The SDL scalar name and catalog key. A GraphQL name. */
  readonly name: TName;
  /** The `ph` property that exposes the factory. Default: `name`. `Amount_Money` sets `Money`. */
  readonly builderName?: TBuilderName;
  readonly description: string;
  /** The wire shape of a value. It picks the literal kinds a derived coercion accepts and the `typescriptType` default. */
  readonly representation: TRepresentation;
  /** Validates every value of a `ph` field of this scalar. */
  readonly validator: z.ZodType<TBase, TInput>;
  /** `validator` as the source text generated packages validate with. */
  readonly zodSource: string;
  /** The TypeScript type generated code gives the scalar. Default: `string`, `number`, `boolean`, `Record<string, unknown>` for `json-object`, otherwise `unknown`. */
  readonly typescriptType?: string;
  /** Default: derived, which runs `validator` on every path and accepts only the literal kinds of `representation`. */
  readonly coercion?: ScalarCoercion<NoInfer<TBase>>;
  /** Whether a value can live in document state. Default: `true`. */
  readonly persistable?: boolean;
  /** The empty value of a field. Default: `{ kind: "none", reason: "<name> has no meaningful empty value" }`. */
  readonly zero?: ScalarZero;
};

export type AnyScalarDeclaration = ScalarDeclaration;

export type ResolvedScalarDeclaration<
  TName extends string = string,
  TBuilderName extends string = string,
  TBase = unknown,
  TInput = TBase,
> = {
  readonly name: TName;
  readonly builderName: TBuilderName;
  readonly description: string;
  readonly representation: ScalarRepresentation;
  readonly validator: z.ZodType<TBase, TInput>;
  readonly zodSource: string;
  readonly typescriptType: string;
  readonly coercion?: ScalarCoercion<TBase>;
  readonly persistable: boolean;
  readonly zero: ScalarZero;
};

const DEFAULT_TYPESCRIPT_TYPE = {
  string: "string",
  number: "number",
  boolean: "boolean",
  "json-object": "Record<string, unknown>",
  json: "unknown",
  opaque: "unknown",
} as const satisfies Record<ScalarRepresentation, string>;

const DECLARATION_KEYS = Object.keys({
  name: true,
  builderName: true,
  description: true,
  representation: true,
  validator: true,
  zodSource: true,
  typescriptType: true,
  coercion: true,
  persistable: true,
  zero: true,
} satisfies Record<keyof ResolvedScalarDeclaration, true>);

type ScalarFailure = Omit<DefinitionDiagnosticInput, "code"> & {
  readonly code:
    | "PH-SCALAR-DECLARATION-INVALID"
    | "PH-SCALAR-ZERO-VALUE-INVALID";
};

function fail(name: string, input: ScalarFailure): never {
  throw new DocumentModelDefinitionError([
    createDiagnostic({
      ...input,
      definition: { kind: "scalar", key: name },
    }),
  ]);
}

export function parseScalarDeclaration(
  input: AnyScalarDeclaration,
): ResolvedScalarDeclaration {
  const snapshot = snapshotRecord(input, DECLARATION_KEYS, []);
  if (!snapshot.ok) {
    fail(String((input as { readonly name?: unknown }).name), {
      code: "PH-SCALAR-DECLARATION-INVALID",
      path: snapshot.path,
      message: `The declaration could not be snapshotted (${snapshot.reason}).`,
      received: snapshot.reason,
      repair: "Pass a plain declaration object with data properties only.",
    });
  }
  const declaration = withDefaults(
    snapshot.value as unknown as AnyScalarDeclaration,
  );
  assertShape(declaration);
  assertZero(declaration);
  return declaration;
}

function withDefaults(
  declaration: AnyScalarDeclaration,
): ResolvedScalarDeclaration {
  const { coercion } = declaration;
  return {
    name: declaration.name,
    builderName: declaration.builderName ?? declaration.name,
    description: declaration.description,
    representation: declaration.representation,
    validator: declaration.validator,
    zodSource: declaration.zodSource,
    typescriptType:
      declaration.typescriptType ??
      DEFAULT_TYPESCRIPT_TYPE[declaration.representation],
    ...(coercion === undefined ? {} : { coercion }),
    persistable: declaration.persistable ?? true,
    zero: declaration.zero ?? {
      kind: "none",
      reason: `${declaration.name} has no meaningful empty value`,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertShape(declaration: ResolvedScalarDeclaration): void {
  const name = declaration.name;
  if (!isAuthoredSchemaName(name)) {
    fail(String(name), {
      code: "PH-SCALAR-DECLARATION-INVALID",
      path: ["name"],
      message: "A scalar name must be a GraphQL name.",
      received: typeof name === "string" ? name : typeof name,
      repair: "Use the registered SDL scalar name.",
    });
  }
  if (
    typeof declaration.builderName !== "string" ||
    !isAuthoredSchemaName(declaration.builderName)
  ) {
    fail(name, {
      code: "PH-SCALAR-DECLARATION-INVALID",
      path: ["builderName"],
      message: "A scalar builderName must be a GraphQL name.",
      repair:
        "Omit builderName to use the scalar name, or set it to the ph property name, such as Money for Amount_Money.",
    });
  }
  if (
    typeof declaration.description !== "string" ||
    declaration.description === ""
  ) {
    fail(name, {
      code: "PH-SCALAR-DECLARATION-INVALID",
      path: ["description"],
      message: `Scalar ${name} has no description.`,
      repair:
        "Add a one-sentence description; it is the whole contract an introspecting agent reads.",
    });
  }
  if (!Object.hasOwn(DEFAULT_TYPESCRIPT_TYPE, declaration.representation)) {
    fail(name, {
      code: "PH-SCALAR-DECLARATION-INVALID",
      path: ["representation"],
      message: `Scalar ${name} has no known representation.`,
      expected: Object.keys(DEFAULT_TYPESCRIPT_TYPE).join(", "),
      received: String(declaration.representation),
      repair: "Declare the wire shape of the scalar's values.",
    });
  }
  const validator: unknown = declaration.validator;
  if (
    !isRecord(validator) ||
    typeof validator.parse !== "function" ||
    typeof validator.safeParse !== "function"
  ) {
    fail(name, {
      code: "PH-SCALAR-DECLARATION-INVALID",
      path: ["validator"],
      message: `Scalar ${name} has no Zod validator.`,
      repair: "Provide a Zod schema with parse and safeParse.",
    });
  }
  const coercion: unknown = declaration.coercion;
  if (
    coercion !== undefined &&
    (!isRecord(coercion) ||
      typeof coercion.parseValue !== "function" ||
      typeof coercion.parseLiteral !== "function" ||
      typeof coercion.serialize !== "function")
  ) {
    fail(name, {
      code: "PH-SCALAR-DECLARATION-INVALID",
      path: ["coercion"],
      message: `Scalar ${name} must either omit coercion or provide parseValue, parseLiteral, and serialize.`,
      repair: "Omit coercion to derive it, or provide all three functions.",
    });
  }
  for (const key of ["typescriptType", "zodSource"] as const) {
    if (typeof declaration[key] !== "string" || declaration[key] === "") {
      fail(name, {
        code: "PH-SCALAR-DECLARATION-INVALID",
        path: [key],
        message: `Scalar ${name} must record its ${key}.`,
        repair: `Set ${key} to the exact source string generated code uses.`,
      });
    }
  }
}

function assertZero(declaration: ResolvedScalarDeclaration): void {
  const name = declaration.name;
  const zero: unknown = declaration.zero;
  if (!isRecord(zero) || (zero.kind !== "value" && zero.kind !== "none")) {
    fail(name, {
      code: "PH-SCALAR-ZERO-VALUE-INVALID",
      path: ["zero"],
      message: `Scalar ${name} has no zero-value policy.`,
      repair:
        'Declare zero as { kind: "value", value } or { kind: "none", reason }.',
    });
  }
  if (zero.kind === "none") {
    if (typeof zero.reason !== "string" || zero.reason === "") {
      fail(name, {
        code: "PH-SCALAR-ZERO-VALUE-INVALID",
        path: ["zero", "reason"],
        message: `Scalar ${name} declares no zero value but gives no reason.`,
        repair: "State why the scalar has no meaningful zero value.",
      });
    }
    return;
  }
  try {
    canonicalJson(zero.value);
  } catch {
    fail(name, {
      code: "PH-SCALAR-ZERO-VALUE-INVALID",
      path: ["zero", "value"],
      message: `Scalar ${name} declares a zero value that is not JSON.`,
      repair: "Use a JSON zero value.",
    });
  }
  if (!declaration.validator.safeParse(zero.value).success) {
    fail(name, {
      code: "PH-SCALAR-ZERO-VALUE-INVALID",
      path: ["zero", "value"],
      message: `Scalar ${name} rejects its own zero value.`,
      received: JSON.stringify(zero.value),
      repair:
        'Declare a zero value the validator accepts, or use { kind: "none", reason }.',
    });
  }
}
