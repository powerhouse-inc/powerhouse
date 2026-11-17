/** Source helpers the subgraph and document-model migrations share. */
import {
  type ImportDeclaration,
  Node,
  SyntaxKind,
  type VariableDeclaration,
  VariableDeclarationKind,
} from "ts-morph";

/** Const aliases keep the same callable and arrows ignore a caller's receiver. */
export function stableArrow(node: Node, seen = new Set<Node>()): boolean {
  let value = node;
  while (
    Node.isParenthesizedExpression(value) ||
    Node.isAsExpression(value) ||
    Node.isSatisfiesExpression(value) ||
    Node.isTypeAssertion(value) ||
    Node.isNonNullExpression(value)
  ) {
    value = value.getExpression();
  }
  if (Node.isArrowFunction(value)) return true;
  if (!Node.isIdentifier(value) || seen.has(value)) return false;
  seen.add(value);
  const parent = value.getParent();
  const symbol =
    parent !== undefined && Node.isShorthandPropertyAssignment(parent)
      ? parent.getValueSymbol()
      : value.getSymbol();
  const declarations = (
    symbol?.getAliasedSymbol() ?? symbol
  )?.getDeclarations();
  if (declarations?.length !== 1) return false;
  const declaration = declarations[0];
  if (
    !Node.isVariableDeclaration(declaration) ||
    !Node.isIdentifier(declaration.getNameNode()) ||
    declaration.getVariableStatement()?.getDeclarationKind() !==
      VariableDeclarationKind.Const
  ) {
    return false;
  }
  const initializer = declaration.getInitializer();
  return initializer !== undefined && stableArrow(initializer, seen);
}

/** Direct eval can read bindings and arguments that source rewriting cannot see. */
export function directEvalCall(node: Node): Node | undefined {
  return node.getDescendantsOfKind(SyntaxKind.CallExpression).find((call) => {
    let callee: Node = call.getExpression();
    while (
      Node.isParenthesizedExpression(callee) ||
      Node.isAsExpression(callee) ||
      Node.isSatisfiesExpression(callee) ||
      Node.isTypeAssertion(callee) ||
      Node.isNonNullExpression(callee)
    ) {
      callee = callee.getExpression();
    }
    return Node.isIdentifier(callee) && callee.compilerNode.text === "eval";
  });
}

/** A read whose value changes when its module moves. */
export function importMetaRead(node: Node): Node | undefined {
  return node
    .getDescendantsOfKind(SyntaxKind.MetaProperty)
    .find(
      (meta) =>
        meta.getFirstChildByKind(SyntaxKind.ImportKeyword) !== undefined,
    );
}

/** The frame a this/arguments read belongs to; computed names and heritage use the outer frame. */
export function callFrameOwner(node: Node): Node | undefined {
  for (
    let child = node, parent = node.getParent();
    parent !== undefined;
    child = parent, parent = parent.getParent()
  ) {
    if (Node.isDecorator(parent)) {
      const decoratedClass = parent.getFirstAncestor(
        (ancestor) =>
          Node.isClassDeclaration(ancestor) || Node.isClassExpression(ancestor),
      );
      return callFrameOwner(decoratedClass ?? parent.getParentOrThrow());
    }
    if (
      Node.isFunctionDeclaration(parent) ||
      Node.isFunctionExpression(parent)
    ) {
      return parent;
    }
    if (
      Node.isMethodDeclaration(parent) ||
      Node.isGetAccessorDeclaration(parent) ||
      Node.isSetAccessorDeclaration(parent)
    ) {
      if (child !== parent.getNameNode() && !Node.isDecorator(child))
        return parent;
    }
    if (
      Node.isConstructorDeclaration(parent) ||
      Node.isClassStaticBlockDeclaration(parent)
    ) {
      return parent;
    }
    if (
      Node.isPropertyDeclaration(parent) &&
      child === parent.getInitializer()
    ) {
      return parent;
    }
  }
  return undefined;
}

/** `wanted`, or the first of `wanted2`, `wanted3`, … that `taken` does not hold. */
export function freeName(
  taken: { has(name: string): boolean },
  wanted: string,
): string {
  let name = wanted;
  for (let suffix = 2; taken.has(name); suffix++) name = `${wanted}${suffix}`;
  return name;
}

/**
 * The names an import declaration binds, each with what it imports:
 * `default`, `*`, or the name an export has in its module.
 */
export function importBindings(declaration: ImportDeclaration): {
  readonly local: Node;
  readonly imported: string;
  readonly isTypeOnly: boolean;
}[] {
  const defaultImport = declaration.getDefaultImport();
  const namespace = declaration.getNamespaceImport();
  return [
    ...(defaultImport === undefined
      ? []
      : [
          {
            local: defaultImport,
            imported: "default",
            isTypeOnly: declaration.isTypeOnly(),
          },
        ]),
    ...(namespace === undefined
      ? []
      : [
          {
            local: namespace,
            imported: "*",
            isTypeOnly: declaration.isTypeOnly(),
          },
        ]),
    ...declaration.getNamedImports().map((named) => ({
      local: named.getAliasNode() ?? named.getNameNode(),
      imported: named.getName(),
      isTypeOnly: declaration.isTypeOnly() || named.isTypeOnly(),
    })),
  ];
}

/**
 * The names a variable declaration binds. A destructuring pattern also
 * yields the property names it reads, so a caller avoiding clashes avoids
 * those too.
 */
export function variableNames(declaration: VariableDeclaration): string[] {
  const nameNode = declaration.getNameNode();
  return nameNode
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .map((identifier) => identifier.getText())
    .concat(Node.isIdentifier(nameNode) ? [nameNode.getText()] : []);
}
