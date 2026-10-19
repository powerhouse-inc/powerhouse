import { createRequire } from "node:module";
import type { ts as TypeScript } from "ts-morph";

const LEGACY_FIELDS = [
  "name",
  "typeDefs",
  "resolvers",
  "hasSubscriptions",
  "path",
] as const;

type LegacyField = (typeof LEGACY_FIELDS)[number];

export function legacyFieldsDeclaredBy(
  subgraphClass: object,
  isAuthored: (candidate: object) => boolean,
): readonly LegacyField[] {
  const declared = new Set<LegacyField>();
  let current: unknown = subgraphClass;
  while (typeof current === "function" && isAuthored(current)) {
    const prototype: unknown = current.prototype;
    if (typeof prototype === "object" && prototype !== null) {
      for (const field of LEGACY_FIELDS) {
        if (Object.hasOwn(prototype, field)) declared.add(field);
      }
    }
    for (const field of instanceFieldsIn(sourceOf(current))) {
      declared.add(field);
    }
    current = Object.getPrototypeOf(current);
  }
  return LEGACY_FIELDS.filter((field) => declared.has(field));
}

function sourceOf(candidate: object): string {
  try {
    return Function.prototype.toString.call(candidate);
  } catch {
    return "";
  }
}

function isLegacyField(name: string | undefined): name is LegacyField {
  return (LEGACY_FIELDS as readonly (string | undefined)[]).includes(name);
}

const MENTIONS_A_FIELD = new RegExp(`\\b(?:${LEGACY_FIELDS.join("|")})\\b`);

let typescript: typeof TypeScript | undefined;

function loadTypeScript(): typeof TypeScript {
  typescript ??= (
    createRequire(import.meta.url)("ts-morph") as { ts: typeof TypeScript }
  ).ts;
  return typescript;
}

function instanceFieldsIn(source: string): LegacyField[] {
  if (!/^class\b/.test(source) || !MENTIONS_A_FIELD.test(source)) return [];
  const ts = loadTypeScript();
  // Parenthesized, so an anonymous class parses as an expression.
  const file = ts.createSourceFile(
    "subgraph-class.js",
    `(${source}\n)`,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.JS,
  );
  const statement = file.statements.at(0);
  const parsed =
    statement !== undefined && ts.isExpressionStatement(statement)
      ? unwrap(ts, statement.expression)
      : undefined;
  if (parsed === undefined || !ts.isClassExpression(parsed)) return [];
  return instanceFieldsOfClass(ts, parsed);
}

function instanceFieldsOfClass(
  ts: typeof TypeScript,
  declaration: TypeScript.ClassExpression,
): LegacyField[] {
  const fields: LegacyField[] = [];
  const add = (name: string | undefined) => {
    if (isLegacyField(name)) fields.push(name);
  };

  const isInstance = (node: TypeScript.Expression) => {
    const receiver = unwrap(ts, node);
    return (
      receiver.kind === ts.SyntaxKind.ThisKeyword ||
      receiver.kind === ts.SyntaxKind.SuperKeyword
    );
  };

  const addTarget = (node: TypeScript.Expression): void => {
    const target = unwrap(ts, node);
    if (
      ts.isPropertyAccessExpression(target) &&
      isInstance(target.expression)
    ) {
      if (ts.isIdentifier(target.name)) add(target.name.text);
    } else if (
      ts.isElementAccessExpression(target) &&
      isInstance(target.expression)
    ) {
      add(literalText(ts, target.argumentExpression));
    } else if (ts.isObjectLiteralExpression(target)) {
      for (const property of target.properties) {
        if (ts.isPropertyAssignment(property)) addTarget(property.initializer);
        else if (ts.isSpreadAssignment(property))
          addTarget(property.expression);
      }
    } else if (ts.isArrayLiteralExpression(target)) {
      for (const element of target.elements) {
        addTarget(ts.isSpreadElement(element) ? element.expression : element);
      }
    } else if (
      ts.isBinaryExpression(target) &&
      target.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ) {
      addTarget(target.left);
    }
  };

  const addKeys = (node: TypeScript.Expression): void => {
    const source = unwrap(ts, node);
    if (!ts.isObjectLiteralExpression(source)) return;
    for (const property of source.properties) {
      if (ts.isSpreadAssignment(property)) addKeys(property.expression);
      else add(propertyNameText(ts, property.name));
    }
  };

  const addCall = (call: TypeScript.CallExpression) => {
    const receiver = call.arguments.at(0);
    const key = call.arguments.at(1);
    if (receiver === undefined || !isInstance(receiver)) return;
    const callee = calleeName(ts, call.expression);
    if (callee === "Object.assign") {
      for (const source of call.arguments.slice(1)) addKeys(source);
    } else if (key === undefined || callee === undefined) {
      return;
    } else if (callee === "Object.defineProperties") {
      addKeys(key);
    } else if (DEFINES_A_KEY.test(callee)) {
      add(literalText(ts, key));
    }
  };

  const visit = (node: TypeScript.Node): void => {
    if (bindsOwnThis(ts, node)) return;
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
    ) {
      addTarget(node.left);
    } else if (
      (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      (node.operator === ts.SyntaxKind.PlusPlusToken ||
        node.operator === ts.SyntaxKind.MinusMinusToken)
    ) {
      addTarget(node.operand);
    } else if (
      (ts.isForOfStatement(node) || ts.isForInStatement(node)) &&
      !ts.isVariableDeclarationList(node.initializer)
    ) {
      addTarget(node.initializer);
    } else if (ts.isCallExpression(node)) {
      addCall(node);
    }
    ts.forEachChild(node, visit);
  };

  const visitInstanceMember = (member: TypeScript.ClassElement): void => {
    if (ts.isClassStaticBlockDeclaration(member) || isStatic(ts, member)) {
      return;
    }
    if (ts.isPropertyDeclaration(member)) {
      add(propertyNameText(ts, member.name));
      if (member.initializer !== undefined) visit(member.initializer);
    } else if (
      ts.isConstructorDeclaration(member) ||
      ts.isMethodDeclaration(member) ||
      ts.isGetAccessorDeclaration(member) ||
      ts.isSetAccessorDeclaration(member)
    ) {
      for (const parameter of member.parameters)
        ts.forEachChild(parameter, visit);
      if (member.body !== undefined) visit(member.body);
    }
  };

  for (const member of declaration.members) visitInstanceMember(member);
  return fields;
}

function bindsOwnThis(ts: typeof TypeScript, node: TypeScript.Node): boolean {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isClassDeclaration(node) ||
    ts.isClassExpression(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  );
}

/**
 * Calls that define a key on their first argument: `Object.defineProperty`,
 * its `Reflect` forms, and the helpers compilers lower class fields to, such
 * as esbuild's `__publicField`, Babel's `_defineProperty` and SWC's
 * `_define_property`.
 */
const DEFINES_A_KEY =
  /^(?:Object\.defineProperty|Reflect\.defineProperty|Reflect\.set|_*(?:publicField|defineProperty|define_property)\d*)$/;

function calleeName(
  ts: typeof TypeScript,
  node: TypeScript.Expression,
): string | undefined {
  const callee = unwrap(ts, node);
  if (ts.isIdentifier(callee)) return callee.text;
  if (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    ts.isIdentifier(callee.name)
  ) {
    return `${callee.expression.text}.${callee.name.text}`;
  }
  return undefined;
}

function isStatic(ts: typeof TypeScript, member: TypeScript.Node): boolean {
  return (
    ts.canHaveModifiers(member) &&
    (ts.getModifiers(member) ?? []).some(
      (modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword,
    )
  );
}

function propertyNameText(
  ts: typeof TypeScript,
  name: TypeScript.PropertyName,
): string | undefined {
  if (ts.isIdentifier(name)) return name.text;
  if (ts.isComputedPropertyName(name)) return literalText(ts, name.expression);
  return literalText(ts, name);
}

function literalText(
  ts: typeof TypeScript,
  node: TypeScript.Node,
): string | undefined {
  const literal = ts.isParenthesizedExpression(node) ? unwrap(ts, node) : node;
  return ts.isStringLiteral(literal) ||
    ts.isNoSubstitutionTemplateLiteral(literal)
    ? literal.text
    : undefined;
}

function unwrap(
  ts: typeof TypeScript,
  node: TypeScript.Expression,
): TypeScript.Expression {
  let current = node;
  while (ts.isParenthesizedExpression(current)) current = current.expression;
  return current;
}
