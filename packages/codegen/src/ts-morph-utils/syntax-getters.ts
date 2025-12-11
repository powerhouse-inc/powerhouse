import type {
  ArrayLiteralExpression,
  ObjectLiteralExpression,
  SourceFile,
  StringLiteral,
  VariableStatement,
} from "ts-morph";
import { SyntaxKind } from "ts-morph";

export function getVariableDeclarationByTypeName(
  sourceFile: SourceFile,
  typeName: string,
) {
  const variableDeclarations = sourceFile.getVariableDeclarations();
  return variableDeclarations.find((declaration) =>
    declaration.getType().getText().includes(typeName),
  );
}

export function getAllVariableDeclarationsByTypeName(
  sourceFiles: SourceFile[],
  typeName: string,
) {
  const variableDeclarations = sourceFiles.flatMap((sourceFile) =>
    sourceFile.getVariableDeclarations(),
  );
  return variableDeclarations.filter((declaration) =>
    declaration.getType().getText().includes(typeName),
  );
}

export function getTypeDeclarationByTypeName(
  sourceFile: SourceFile | undefined,
  typeName: string,
) {
  if (!sourceFile) return undefined;
  const typeAliases = sourceFile.getTypeAliases();
  return typeAliases.find((alias) =>
    alias.getTypeNode()?.getText().includes(typeName),
  );
}

export function getStringLiteralValue(
  stringLiteral: StringLiteral | undefined,
) {
  return stringLiteral?.getText().replace(/["']/g, "");
}

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

export function getArrayLiteralExpressionElementsText(
  arrayLiteralExpression: ArrayLiteralExpression | undefined,
) {
  return arrayLiteralExpression
    ?.getElements()
    .map((element) => element.getText())
    .map((text) => text.replace(/["']/g, ""));
}

export function getObjectLiteral(statement: VariableStatement | undefined) {
  return statement
    ?.getDeclarations()
    .at(0)
    ?.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
}

export function getArrayNumberElements(array: ArrayLiteralExpression) {
  const elements = array
    .getElements()
    .map((el) => el.asKindOrThrow(SyntaxKind.NumericLiteral).getLiteralValue());

  return elements;
}
