import type {
  ScalarRepresentation,
  ScalarZero,
} from "@powerhousedao/shared/document-model";
import type { z } from "zod";
import { rejectionReceived, snapshotRecord } from "../data-properties.js";
import {
  type DefinitionDiagnosticInput,
  DocumentModelDefinitionError,
  createDiagnostic,
  describeReceived,
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

/** `name` is the declared scalar name, or `undefined` when there is none to name. */
function fail(name: string | undefined, input: ScalarFailure): never {
  throw new DocumentModelDefinitionError([
    createDiagnostic({
      ...input,
      ...(name !== undefined && { definition: { kind: "scalar", key: name } }),
    }),
  ]);
}

/** Reads a refused declaration's own string `name` without running author code. */
function ownStringName(input: unknown): string | undefined {
  if (input === null || typeof input !== "object") return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(input, "name");
    const name: unknown = descriptor?.value;
    return typeof name === "string" ? name : undefined;
  } catch {
    return undefined;
  }
}

export function parseScalarDeclaration(
  input: AnyScalarDeclaration,
): ResolvedScalarDeclaration {
  const snapshot = snapshotRecord(input, DECLARATION_KEYS, []);
  if (!snapshot.ok) {
    const name = ownStringName(input);
    if (snapshot.reason === "unknown-key" && snapshot.key === "visibility") {
      fail(name, {
        code: "PH-SCALAR-DECLARATION-INVALID",
        path: ["visibility"],
        message: `${name === undefined ? "This scalar declaration" : `Scalar ${name}`} sets visibility, which defineScalar does not take.`,
        repair:
          "Remove visibility. Only the compiler catalog declares internal scalars, so every scalar defineScalar returns is one authors use.",
      });
    }
    fail(name, {
      code: "PH-SCALAR-DECLARATION-INVALID",
      path: snapshot.path,
      message: `The declaration could not be snapshotted (${snapshot.reason}).`,
      received: rejectionReceived(snapshot),
      repair: "Pass a plain declaration object with data properties only.",
    });
  }
  const name = snapshot.value.name;
  if (!isAuthoredSchemaName(name)) {
    fail(typeof name === "string" ? name : undefined, {
      code: "PH-SCALAR-DECLARATION-INVALID",
      path: ["name"],
      message: "A scalar name must be a GraphQL name.",
      received: typeof name === "string" ? name : describeReceived(name),
      repair: "Use the registered SDL scalar name.",
    });
  }
  const representation = snapshot.value.representation;
  if (
    typeof representation !== "string" ||
    !Object.hasOwn(DEFAULT_TYPESCRIPT_TYPE, representation)
  ) {
    fail(name, {
      code: "PH-SCALAR-DECLARATION-INVALID",
      path: ["representation"],
      message: `Scalar ${name} has no known representation.`,
      expected: Object.keys(DEFAULT_TYPESCRIPT_TYPE).join(", "),
      received:
        typeof representation === "string"
          ? representation
          : describeReceived(representation),
      repair: "Declare the wire shape of the scalar's values.",
    });
  }
  const declaration = withDefaults(
    snapshot.value as unknown as AnyScalarDeclaration,
  );
  assertShape(declaration);
  const coercion = snapshotCoercion(name, declaration.coercion);
  return {
    ...declaration,
    ...(coercion === undefined ? {} : { coercion }),
    zero: snapshotZero(declaration),
  };
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

/** Whether `value` is an object whose `methods` are functions, read without letting a throw escape. */
function hasMethods(value: unknown, methods: readonly string[]): boolean {
  if (value === null || typeof value !== "object") return false;
  try {
    return methods.every(
      (method) =>
        typeof (value as Record<string, unknown>)[method] === "function",
    );
  } catch {
    return false;
  }
}

const COERCION_KEYS = ["parseValue", "parseLiteral", "serialize"];

const ZERO_KEYS = {
  value: ["kind", "value"],
  none: ["kind", "reason"],
} as const satisfies Record<ScalarZero["kind"], readonly string[]>;

function assertShape(declaration: ResolvedScalarDeclaration): void {
  const name = declaration.name;
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
  if (!hasMethods(declaration.validator, ["parse", "safeParse"])) {
    fail(name, {
      code: "PH-SCALAR-DECLARATION-INVALID",
      path: ["validator"],
      message: `Scalar ${name} has no Zod validator.`,
      repair: "Provide a Zod schema with parse and safeParse.",
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

function snapshotCoercion(
  name: string,
  value: unknown,
): ScalarCoercion<unknown> | undefined {
  if (value === undefined) return undefined;
  const repair =
    "Omit coercion to derive it, or pass an object with parseValue, parseLiteral, and serialize.";
  if (value === null || typeof value !== "object") {
    fail(name, {
      code: "PH-SCALAR-DECLARATION-INVALID",
      path: ["coercion"],
      message: `Scalar ${name}'s coercion must be an object.`,
      received: describeReceived(value),
      repair,
    });
  }
  // A class instance keeps its methods on the prototype, so each member is
  // looked up along the chain by descriptor: a method is read without
  // running author code, and an accessor is refused unrun.
  const members: Partial<Record<(typeof COERCION_KEYS)[number], unknown>> = {};
  for (const key of COERCION_KEYS) {
    const found = dataMember(value, key);
    if (found === "accessor" || found === "inspection-failed") {
      fail(name, {
        code: "PH-SCALAR-DECLARATION-INVALID",
        path: found === "accessor" ? ["coercion", key] : ["coercion"],
        message: `Scalar ${name}'s coercion could not be read (${found}).`,
        received: found,
        repair,
      });
    }
    members[key] = found.value;
  }
  if (COERCION_KEYS.some((key) => typeof members[key] !== "function")) {
    fail(name, {
      code: "PH-SCALAR-DECLARATION-INVALID",
      path: ["coercion"],
      message: `Scalar ${name} must either omit coercion or provide parseValue, parseLiteral, and serialize.`,
      repair: "Omit coercion to derive it, or provide all three functions.",
    });
  }
  return members as ScalarCoercion<unknown>;
}

/** The data value `key` resolves to along `target`'s prototype chain. */
function dataMember(
  target: object,
  key: string,
): { readonly value: unknown } | "accessor" | "inspection-failed" {
  try {
    for (
      let current: object | null = target;
      current !== null;
      current = Object.getPrototypeOf(current) as object | null
    ) {
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (descriptor === undefined) continue;
      return "value" in descriptor ? { value: descriptor.value } : "accessor";
    }
    return { value: undefined };
  } catch {
    return "inspection-failed";
  }
}

function snapshotZero(declaration: ResolvedScalarDeclaration): ScalarZero {
  const name = declaration.name;
  const repair =
    'Declare zero as { kind: "value", value } or { kind: "none", reason }.';
  const snapshot = snapshotRecord(
    declaration.zero,
    ["kind", "value", "reason"],
    ["zero"],
  );
  if (!snapshot.ok) {
    fail(name, {
      code: "PH-SCALAR-ZERO-VALUE-INVALID",
      path: snapshot.path,
      message: `Scalar ${name}'s zero-value policy could not be snapshotted (${snapshot.reason}).`,
      received: rejectionReceived(snapshot),
      repair,
    });
  }
  const zero = snapshot.value;
  if (zero.kind !== "value" && zero.kind !== "none") {
    fail(name, {
      code: "PH-SCALAR-ZERO-VALUE-INVALID",
      path: ["zero"],
      message: `Scalar ${name} has no zero-value policy.`,
      repair,
    });
  }
  const allowed: readonly string[] = ZERO_KEYS[zero.kind];
  const other = Object.keys(zero).find((key) => !allowed.includes(key));
  if (other !== undefined) {
    fail(name, {
      code: "PH-SCALAR-ZERO-VALUE-INVALID",
      path: ["zero", other],
      message: `Scalar ${name} declares a zero of kind ${JSON.stringify(zero.kind)}, which takes no ${other}.`,
      received: other,
      repair,
    });
  }
  if (zero.kind === "none") {
    const reason = zero.reason;
    if (typeof reason !== "string" || reason === "") {
      fail(name, {
        code: "PH-SCALAR-ZERO-VALUE-INVALID",
        path: ["zero", "reason"],
        message: `Scalar ${name} declares no zero value but gives no reason.`,
        repair: "State why the scalar has no meaningful zero value.",
      });
    }
    return { kind: "none", reason };
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
  return zero as ScalarZero;
}
