import type { SourceFile } from "ts-morph";
import { ts } from "ts-morph";

/** Builds a ts-morph ObjectLiteralExpression from a ts/js object
 * Useful for substituting the value of a runtime object in templates
 */
export function buildObjectLiteral(
  inputObject: object,
  sourceFile: SourceFile,
) {
  const propertyAssignments: ts.PropertyAssignment[] = [];
  for (const [key, value] of Object.entries(inputObject)) {
    const propertyAssignment = buildPropertyAssignment(key, value);
    propertyAssignments.push(propertyAssignment);
  }
  const objectLiteral = ts.factory.createObjectLiteralExpression(
    propertyAssignments,
    true,
  );

  const printNode = buildNodePrinter(sourceFile);
  return printNode(objectLiteral);
}

function buildFalse() {
  return ts.factory.createFalse();
}

function buildTrue() {
  return ts.factory.createTrue();
}

function buildBoolean(value: boolean) {
  return value ? buildTrue() : buildFalse();
}

function buildNull() {
  return ts.factory.createNull();
}

function buildUndefined() {
  return ts.factory.createIdentifier("undefined");
}

function buildNumericLiteral(value: number) {
  return ts.factory.createNumericLiteral(value);
}

export function buildStringLiteral(value: string) {
  return ts.factory.createStringLiteral(value);
}

function buildArrayLiteral(elements: ts.Expression[]) {
  return ts.factory.createArrayLiteralExpression(elements, true);
}

function valueToExpression(value: unknown): ts.Expression {
  if (value === null) return buildNull();
  if (value === undefined) return buildUndefined();
  if (typeof value === "boolean") return buildBoolean(value);
  if (typeof value === "string") return buildStringLiteral(value);
  if (typeof value === "number") return buildNumericLiteral(value);

  if (Array.isArray(value)) {
    const elements = value.map((item) => valueToExpression(item));
    return buildArrayLiteral(elements);
  }

  if (typeof value === "object") {
    return ts.factory.createObjectLiteralExpression(
      Object.entries(value).map(([key, v]) => {
        const name = ts.factory.createIdentifier(key);
        return ts.factory.createPropertyAssignment(name, valueToExpression(v));
      }),
      true,
    );
  }

  throw new Error("Invalid value passed: ", value);
}

function buildPropertyAssignment(name: string, value: unknown) {
  const nameIdentifier = ts.factory.createIdentifier(name);
  const valueExpression = valueToExpression(value);

  const propertyAssignment = ts.factory.createPropertyAssignment(
    nameIdentifier,
    valueExpression,
  );

  return propertyAssignment;
}

function buildNodePrinter(sourceFile: SourceFile) {
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  return (node: ts.Node) =>
    printer.printNode(ts.EmitHint.Unspecified, node, sourceFile.compilerNode);
}
