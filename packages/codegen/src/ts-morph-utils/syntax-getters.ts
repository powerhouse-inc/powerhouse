import type { ObjectLiteralExpression, VariableStatement } from "ts-morph";
import { SyntaxKind } from "ts-morph";

/** Returns the value of a property in a ts-morph ObjectLiteralExpression of type T if it exists */
export function getObjectProperty<T extends SyntaxKind>(
  object: ObjectLiteralExpression | undefined,
  propertyName: string,
  propertyType: T,
) {
  return object
    ?.getProperty(propertyName)
    ?.asKind(SyntaxKind.PropertyAssignment)
    ?.getChildren()
    .find((child) => child.getKind() === propertyType)
    ?.asKindOrThrow(propertyType);
}

export function getObjectLiteral(statement: VariableStatement | undefined) {
  return statement
    ?.getDeclarations()
    .at(0)
    ?.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
}
