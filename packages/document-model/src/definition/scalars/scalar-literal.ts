import type { JsonValue } from "@powerhousedao/shared/document-model";

/**
 * Closed literal grammar handed to `parseLiteral`. It mirrors the GraphQL
 * literal kinds the catalog supports so a declaration never needs graphql-js.
 */
export type ScalarLiteralNode =
  | { readonly kind: "string"; readonly value: string }
  | { readonly kind: "int"; readonly value: string }
  | { readonly kind: "float"; readonly value: string }
  | { readonly kind: "boolean"; readonly value: boolean }
  | { readonly kind: "null" }
  | { readonly kind: "enum"; readonly value: string }
  | { readonly kind: "list"; readonly values: readonly ScalarLiteralNode[] }
  | {
      readonly kind: "object";
      readonly fields: readonly {
        readonly name: string;
        readonly value: ScalarLiteralNode;
      }[];
    }
  | { readonly kind: "variable"; readonly name: string };

export class ScalarLiteralVariableError extends TypeError {
  constructor(name: string) {
    super(
      `Variable $${name} cannot appear inside a scalar literal; GraphQL resolves variables before literal coercion.`,
    );
    this.name = "ScalarLiteralVariableError";
  }
}

/** Converts a literal node to its runtime value. A variable anywhere throws. */
export function scalarLiteralValue(node: ScalarLiteralNode): unknown {
  switch (node.kind) {
    case "string":
    case "enum":
      return node.value;
    case "int":
    case "float":
      return Number(node.value);
    case "boolean":
      return node.value;
    case "null":
      return null;
    case "list":
      return node.values.map(scalarLiteralValue);
    case "object":
      return Object.fromEntries(
        node.fields.map((field) => [
          field.name,
          scalarLiteralValue(field.value),
        ]),
      );
    case "variable":
      throw new ScalarLiteralVariableError(node.name);
  }
}

/** Builds the literal a JSON value would be written as in a GraphQL document. */
export function literalFromJson(value: JsonValue): ScalarLiteralNode {
  if (value === null) return { kind: "null" };
  if (typeof value === "string") return { kind: "string", value };
  if (typeof value === "boolean") return { kind: "boolean", value };
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { kind: "int", value: String(value) }
      : { kind: "float", value: String(value) };
  }
  if (Array.isArray(value)) {
    return { kind: "list", values: value.map(literalFromJson) };
  }
  return {
    kind: "object",
    fields: Object.entries(value).map(([name, member]) => ({
      name,
      value: literalFromJson(member),
    })),
  };
}

export function objectFields(
  node: ScalarLiteralNode,
): ReadonlyMap<string, ScalarLiteralNode> {
  if (node.kind !== "object")
    throw new TypeError("Value must be an object literal.");
  return new Map(node.fields.map((field) => [field.name, field.value]));
}

export function literalString(
  node: ScalarLiteralNode | undefined,
  field: string,
): string {
  if (node?.kind !== "string")
    throw new TypeError(`${field} must be a string literal.`);
  return node.value;
}

export function floatOnlyNumber(
  node: ScalarLiteralNode | undefined,
  field: string,
): number {
  if (node?.kind !== "float")
    throw new TypeError(`${field} must be a float literal.`);
  return Number.parseFloat(node.value);
}
