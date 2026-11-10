import { type ClassDeclaration, SyntaxKind } from "ts-morph";

export function instanceNameLiteral(classDeclaration: ClassDeclaration) {
  return classDeclaration
    .getInstanceProperty("name")
    ?.asKind(SyntaxKind.PropertyDeclaration)
    ?.getInitializerIfKind(SyntaxKind.StringLiteral)
    ?.getLiteralValue();
}
