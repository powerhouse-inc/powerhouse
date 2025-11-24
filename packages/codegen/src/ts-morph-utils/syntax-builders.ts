import { SyntaxKind, ts } from "ts-morph";

export function buildFalse() {
  return ts.factory.createFalse();
}

export function buildTrue() {
  return ts.factory.createTrue();
}

export function buildNull() {
  return ts.factory.createNull();
}

export function buildReturn(returnValue: string | ts.Expression) {
  const expression =
    typeof returnValue === "string"
      ? ts.factory.createIdentifier(returnValue)
      : returnValue;

  return ts.factory.createReturnStatement(expression);
}

export function buildJsxText(value: string) {
  return ts.factory.createJsxText(value);
}

export function buildJsxStringValueAttribute(name: string, value: string) {
  const attribute = ts.factory.createJsxAttribute(
    ts.factory.createIdentifier(name),
    ts.factory.createStringLiteral(value),
  );
  return attribute;
}

export function buildJsxBooleanAttribute(name: string, value: boolean) {
  const valueExpression = value ? buildTrue() : buildFalse();
  const attribute = ts.factory.createJsxAttribute(
    ts.factory.createIdentifier(name),
    ts.factory.createJsxExpression(undefined, valueExpression),
  );
  return attribute;
}

export function buildJsxAttribute(name: string, value: string) {
  const attribute = ts.factory.createJsxAttribute(
    ts.factory.createIdentifier(name),
    ts.factory.createJsxExpression(
      undefined,
      ts.factory.createIdentifier(value),
    ),
  );
  return attribute;
}
export function buildClassNameAttribute(value: string) {
  const classAttr = ts.factory.createJsxAttribute(
    ts.factory.createIdentifier("className"),
    ts.factory.createStringLiteral(value),
  );

  return classAttr;
}

export function buildJsxElement(
  identifierText: string,
  children: readonly ts.JsxChild[] = [],
  attributes: readonly ts.JsxAttributeLike[] = [],
  typeArguments?: readonly ts.TypeNode[],
) {
  const identifier = ts.factory.createIdentifier(identifierText);
  const openingElement = ts.factory.createJsxOpeningElement(
    identifier,
    typeArguments,
    ts.factory.createJsxAttributes(attributes),
  );
  const closingElement = ts.factory.createJsxClosingElement(identifier);

  const element = ts.factory.createJsxElement(
    openingElement,
    children,
    closingElement,
  );

  return element;
}

export function buildSelfClosingJsxElement(
  identifierText: string,
  attributes: readonly ts.JsxAttributeLike[] = [],
  typeArguments?: readonly ts.TypeNode[],
) {
  const identifier = ts.factory.createIdentifier(identifierText);
  const element = ts.factory.createJsxSelfClosingElement(
    identifier,
    typeArguments,
    ts.factory.createJsxAttributes(attributes),
  );

  return element;
}

type BuildConstAssignmentArgs = {
  name: string | ts.BindingName;
  assignmentExpression: ts.Expression;
  modifiers?: ts.Modifier[];
  type?: ts.TypeNode;
  exclamationToken?: ts.ExclamationToken;
  castAsType?: string;
};
export function buildConstAssignment({
  name,
  assignmentExpression,
  modifiers,
  type,
  exclamationToken,
  castAsType,
}: BuildConstAssignmentArgs) {
  const expression = castAsType
    ? buildTypeCast(assignmentExpression, castAsType).expression
    : assignmentExpression;
  const variableStatement = ts.factory.createVariableStatement(
    modifiers,
    ts.factory.createVariableDeclarationList(
      [
        ts.factory.createVariableDeclaration(
          name,
          exclamationToken,
          type,
          expression,
        ),
      ],
      ts.NodeFlags.Const,
    ),
  );
  return variableStatement;
}

export function buildIfStatement(
  condition: ts.Expression,
  thenStatement: ts.Statement,
  elseStatement?: ts.Statement,
) {
  return ts.factory.createIfStatement(condition, thenStatement, elseStatement);
}
export function buildReturnIfVariableIsTruthy(
  variableName: string | ts.Identifier,
  returnExpression?: ts.Expression,
) {
  const identifier =
    typeof variableName === "string"
      ? ts.factory.createIdentifier(variableName)
      : variableName;
  const returnStatement = returnExpression
    ? ts.factory.createReturnStatement(returnExpression)
    : ts.factory.createReturnStatement();
  return buildIfStatement(identifier, returnStatement);
}
export function buildReturnIfVariableIsFalsy(
  variableName: string | ts.Identifier,
  returnExpression?: ts.Expression,
) {
  const identifier =
    typeof variableName === "string"
      ? ts.factory.createIdentifier(variableName)
      : variableName;
  const returnStatement = returnExpression
    ? ts.factory.createReturnStatement(returnExpression)
    : ts.factory.createReturnStatement();
  return buildIfStatement(
    ts.factory.createLogicalNot(identifier),
    returnStatement,
  );
}

type BuildFunctionCallArgs = {
  functionName: string | ts.Expression;
  argumentsArray?: ts.Expression[] | string[];
  typeParameters?: ts.TypeNode[];
};
export function buildFunctionCall({
  functionName,
  argumentsArray,
  typeParameters,
}: BuildFunctionCallArgs) {
  const callExpression = ts.factory.createCallExpression(
    typeof functionName === "string"
      ? ts.factory.createIdentifier(functionName)
      : functionName,
    typeParameters,
    argumentsArray?.map((argument) =>
      typeof argument === "string"
        ? ts.factory.createIdentifier(argument)
        : argument,
    ),
  );
  return ts.factory.createExpressionStatement(callExpression);
}

export function buildArrayAssignment(elements: string[]) {
  return ts.factory.createArrayBindingPattern(
    elements.map((element) =>
      ts.factory.createBindingElement(undefined, undefined, element),
    ),
  );
}

type BuildDestructuredArrayHookCallArgs = {
  hookName: string;
  destructuredElements: string[];
  hookArguments?: ts.Expression[];
};
export function buildDestructuredArrayHookCallAssignment({
  hookName,
  hookArguments,
  destructuredElements,
}: BuildDestructuredArrayHookCallArgs) {
  const hookCall = buildFunctionCall({
    functionName: hookName,
    argumentsArray: hookArguments,
  });
  const arrayAssignment = buildArrayAssignment(destructuredElements);

  const hookCallAssignment = buildConstAssignment({
    name: arrayAssignment,
    assignmentExpression: hookCall.expression,
  });

  return hookCallAssignment;
}

export function buildObjectPropertyAccess(
  objectName: string,
  propertyName: string,
) {
  const objectIdentifier = ts.factory.createIdentifier(objectName);
  return ts.factory.createPropertyAccessExpression(
    objectIdentifier,
    propertyName,
  );
}

export function buildType(typeName: string, typeArguments?: string[]) {
  const typeNameIdentifier = ts.factory.createIdentifier(typeName);
  const typeArgumentIdentifiers = typeArguments?.map((typeArgument) =>
    ts.factory.createTypeReferenceNode(typeArgument),
  );
  return ts.factory.createTypeReferenceNode(
    typeNameIdentifier,
    typeArgumentIdentifiers,
  );
}

type BuildParameterArgs = {
  name: string;
  typeName?: string;
  initializer?: ts.Expression;
  isOptional?: boolean;
};
export function buildParameters(parameters: BuildParameterArgs[] | undefined) {
  if (!parameters) return [];
  return parameters.map((parameter) =>
    ts.factory.createParameterDeclaration(
      undefined,
      undefined,
      parameter.name,
      parameter.isOptional
        ? ts.factory.createToken(SyntaxKind.QuestionToken)
        : undefined,
      parameter.typeName
        ? ts.factory.createTypeReferenceNode(parameter.typeName)
        : undefined,
      parameter.initializer,
    ),
  );
}
type BuildArrowFunctionArgs = {
  bodyStatements: ts.Statement[];
  parameters?: BuildParameterArgs[];
  type?: ts.TypeNode;
  typeParameters?: ts.TypeParameterDeclaration[];
  modifiers?: ts.Modifier[];
};
export function buildArrowFunction({
  bodyStatements,
  modifiers,
  typeParameters,
  parameters,
  type,
}: BuildArrowFunctionArgs) {
  const bodyBlock = ts.factory.createBlock(bodyStatements, true);
  const parameterDeclarations = buildParameters(parameters);
  return ts.factory.createArrowFunction(
    modifiers,
    typeParameters,
    parameterDeclarations,
    type,
    undefined,
    bodyBlock,
  );
}

type BuildMethodInvocationArgs = {
  objectName: string;
  methodName: string;
  argumentsArray?: ts.Expression[] | string[];
};
export function buildMethodInvocation({
  objectName,
  methodName,
  argumentsArray = [],
}: BuildMethodInvocationArgs) {
  const methodInvocation = buildObjectPropertyAccess(objectName, methodName);
  return buildFunctionCall({
    functionName: methodInvocation,
    argumentsArray,
  });
}

export function buildTypeCast(
  expression: ts.Expression,
  typeName: string,
  typeArguments?: string[],
) {
  const castType = buildType(typeName, typeArguments);
  const castExpression = ts.factory.createAsExpression(expression, castType);
  return ts.factory.createExpressionStatement(castExpression);
}

export function buildStringLiteral(value: string) {
  return ts.factory.createStringLiteral(value);
}

export function buildJsxExpression(value: string | ts.Expression) {
  const expression =
    typeof value === "string" ? ts.factory.createIdentifier(value) : value;
  return ts.factory.createJsxExpression(undefined, expression);
}
