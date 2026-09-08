import type { ScalarLiteralNode } from "./types.js";

/** Converts the closed scalar-literal descriptor into its runtime value. */
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
      throw new TypeError("Variables cannot occur in scalar literals.");
  }
}
