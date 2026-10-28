import { scalarCatalog, type ScalarDefinition } from "document-model/scalars";
import {
  GraphQLScalarType,
  type ValueNode,
  valueFromASTUntyped,
  visit,
} from "graphql";
import { GraphQLJSON, GraphQLJSONObject } from "graphql-type-json";
import { inspect, isDeepStrictEqual } from "node:util";
import { z } from "zod";

export type RegisteredScalar = {
  readonly definition: ScalarDefinition;
  readonly packageName: string;
};

/** The scalars packages register through their `./scalars` entry, by name. */
export type ScalarRegistry = ReadonlyMap<string, RegisteredScalar>;

export const EMPTY_SCALAR_REGISTRY: ScalarRegistry = new Map();

export function sameScalarRegistry(a: ScalarRegistry, b: ScalarRegistry) {
  if (a.size !== b.size) return false;
  for (const [name, scalar] of a) {
    const other = b.get(name);
    if (
      other?.definition !== scalar.definition ||
      other.packageName !== scalar.packageName
    ) {
      return false;
    }
  }
  return true;
}

export const catalogScalarSdl = scalarCatalog
  .map(({ name }) => `scalar ${name}`)
  .join("\n");

export const catalogResolvers = Object.fromEntries(
  scalarCatalog.map(({ name }) => [
    name,
    new GraphQLScalarType({
      serialize: (value) => value,
      parseValue: (value) => value,
      parseLiteral: valueFromASTUntyped,
      ...(name === "JSONObject"
        ? GraphQLJSONObject.toConfig()
        : name === "Unknown"
          ? GraphQLJSON.toConfig()
          : {}),
      name,
    }),
  ]),
);

function hasVariable(ast: ValueNode): boolean {
  let found = false;
  visit(ast, {
    Variable() {
      found = true;
    },
  });
  return found;
}

function losslessJson(value: unknown): { readonly json: unknown } | undefined {
  try {
    const json: unknown = JSON.parse(JSON.stringify(value));
    return isDeepStrictEqual(json, value) ? { json } : undefined;
  } catch {
    return undefined;
  }
}

function show(value: unknown): string {
  try {
    return losslessJson(value)
      ? JSON.stringify(value)
      : inspect(value, { customInspect: false, breakLength: Infinity });
  } catch {
    return "a value that cannot be printed";
  }
}

/** Validates with the definition's schema and accepts only a canonical value. */
export function registeredScalarType(
  definition: ScalarDefinition,
): GraphQLScalarType {
  const check = (value: unknown): unknown => {
    const result = definition.schema.safeParse(value);
    if (!result.success) {
      // Not a GraphQLError: graphql-js wraps a plain error with the type, the
      // value and its location, and would wrap one from another graphql copy
      // anyway, so the message is the same whichever copy validates.
      throw new Error(`${definition.name}: ${z.prettifyError(result.error)}`);
    }
    const output = losslessJson(result.data);
    if (!output) {
      throw new Error(
        `${definition.name}: the schema output is not JSON: ${show(result.data)}`,
      );
    }
    const reparsed = definition.schema.safeParse(output.json);
    if (reparsed.success && isDeepStrictEqual(reparsed.data, result.data)) {
      return result.data;
    }
    const outcome = reparsed.success
      ? `parses to ${show(reparsed.data)}.`
      : `fails it: ${z.prettifyError(reparsed.error)}`;
    throw new Error(
      `${definition.name}: the schema must accept its own output unchanged, but ${show(result.data)} ${outcome}`,
    );
  };
  return new GraphQLScalarType({
    name: definition.name,
    description: definition.description,
    serialize: (value) => value,
    parseValue: check,
    parseLiteral: (ast, variables) => {
      // Validation reads a literal before variables exist; one that nests a
      // variable is checked at execution, when they do.
      if (variables == null && hasVariable(ast)) return null;
      return check(valueFromASTUntyped(ast, variables));
    },
  });
}
