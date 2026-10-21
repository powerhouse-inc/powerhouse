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
  assertValidator(name, declaration.validator);
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

/**
 * Zod 4.6 binds parse and safeParse through prototype accessors. A Zod schema
 * carries its internals in the data property `_zod`, so it is trusted as
 * library code; any other validator is checked as author code.
 */
function isZodSchema(validator: unknown): boolean {
  if (validator === null || typeof validator !== "object") return false;
  try {
    const internals = Object.getOwnPropertyDescriptor(validator, "_zod");
    return (
      internals !== undefined &&
      "value" in internals &&
      typeof internals.value === "object" &&
      internals.value !== null
    );
  } catch {
    return false;
  }
}

function assertValidator(name: string, validator: unknown): void {
  if (isZodSchema(validator)) return;
  methodsOf(validator, "validator", ["parse", "safeParse"], (path, received) =>
    fail(name, {
      code: "PH-SCALAR-DECLARATION-INVALID",
      path,
      message: `Scalar ${name} has no Zod validator.`,
      received,
      repair: "Provide a Zod schema with parse and safeParse.",
    }),
  );
}

function snapshotCoercion(
  name: string,
  value: unknown,
): ScalarCoercion<unknown> | undefined {
  if (value === undefined) return undefined;
  const { parseValue, parseLiteral, serialize } = methodsOf(
    value,
    "coercion",
    ["parseValue", "parseLiteral", "serialize"],
    (path, received) =>
      fail(name, {
        code: "PH-SCALAR-DECLARATION-INVALID",
        path,
        message: `Scalar ${name} must either omit coercion or provide parseValue, parseLiteral, and serialize.`,
        received,
        repair:
          "Omit coercion to derive it, or pass an object with parseValue, parseLiteral, and serialize methods.",
      }),
  );
  // Each method runs on the author's instance, so it keeps its own state.
  const onInstance =
    (method: AuthorMethod) =>
    (...args: unknown[]): unknown =>
      Reflect.apply(method, value, args);
  return {
    parseValue: onInstance(parseValue),
    parseLiteral: onInstance(parseLiteral),
    serialize: onInstance(serialize),
  };
}

type AuthorMethod = (...args: unknown[]) => unknown;

/**
 * The functions `keys` name on the object at `part`. A class instance keeps
 * its methods on the prototype, so each is looked up along the chain by
 * descriptor: a method is read without running author code, and an accessor
 * is refused unrun. A faulty member is refused at its own path with what it
 * holds.
 */
function methodsOf<TKey extends string>(
  value: unknown,
  part: string,
  keys: readonly TKey[],
  refuse: (path: ScalarFailure["path"], received: string) => never,
): Record<TKey, AuthorMethod> {
  let isArray = false;
  try {
    isArray = Array.isArray(value);
  } catch {
    refuse([part], "inspection-failed");
  }
  if (value === null || typeof value !== "object" || isArray) {
    refuse([part], describeReceived(value));
  }
  const methods = {} as Record<TKey, AuthorMethod>;
  for (const key of keys) {
    const found = dataMember(value, key);
    if (found === "inspection-failed") refuse([part], found);
    if (found === "accessor") refuse([part, key], found);
    if (typeof found.value !== "function") {
      refuse([part, key], describeReceived(found.value));
    }
    methods[key] = found.value as AuthorMethod;
  }
  return methods;
}

/** Deeper than any class hierarchy; a proxy can make a chain endless. */
const PROTOTYPE_DEPTH_LIMIT = 64;

/** The data value `key` resolves to along `target`'s prototype chain. */
function dataMember(
  target: object,
  key: string,
): { readonly value: unknown } | "accessor" | "inspection-failed" {
  try {
    let current: object | null = target;
    for (let depth = 0; current !== null; depth++) {
      if (depth === PROTOTYPE_DEPTH_LIMIT) return "inspection-failed";
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (descriptor !== undefined) {
        return "value" in descriptor ? { value: descriptor.value } : "accessor";
      }
      current = Object.getPrototypeOf(current) as object | null;
    }
    return { value: undefined };
  } catch {
    return "inspection-failed";
  }
}

/**
 * `zero` is data the definition carries, so it is a plain record, as every
 * other data position is. A coercion is behavior, so it may be a class
 * instance.
 */
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
