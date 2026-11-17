/** Reads and edits the bindings and imports of a source file. */
import {
  type ImportSpecifier,
  Node,
  type SourceFile,
  SyntaxKind,
} from "ts-morph";
import { importBindings, variableNames } from "../migration-ast.js";

export type ImportedName = {
  readonly name: string;
  readonly alias?: string;
  readonly isTypeOnly?: boolean;
};

/** What each top-level name of `file` is bound to: `<specifier>#<import>` for an import. */
export function localBindings(file: SourceFile): ReadonlyMap<string, string> {
  const bound = new Map<string, string>();
  for (const declaration of file.getImportDeclarations()) {
    const specifier = declaration.getModuleSpecifierValue();
    for (const { local, imported } of importBindings(declaration)) {
      bound.set(local.getText(), `${specifier}#${imported}`);
    }
  }
  for (const name of [
    ...file.getClasses(),
    ...file.getFunctions(),
    ...file.getInterfaces(),
    ...file.getTypeAliases(),
    ...file.getEnums(),
    ...file.getVariableDeclarations(),
  ].flatMap((declaration) => declaration.getName() ?? [])) {
    bound.set(name, "local");
  }
  return bound;
}

/**
 * Whether an identifier refers to a binding. The name of a property, a
 * property access, a class or interface member, or an enum member does not.
 */
export function isReference(identifier: Node): boolean {
  const parent = identifier.getParent();
  if (parent === undefined) return true;
  if (Node.isPropertyAccessExpression(parent)) {
    return parent.getNameNode() !== identifier;
  }
  if (Node.isQualifiedName(parent)) return parent.getRight() !== identifier;
  if (Node.isBindingElement(parent)) {
    return parent.getPropertyNameNode() !== identifier;
  }
  if (
    Node.isPropertyAssignment(parent) ||
    Node.isMethodDeclaration(parent) ||
    Node.isPropertyDeclaration(parent) ||
    Node.isPropertySignature(parent) ||
    Node.isMethodSignature(parent) ||
    Node.isGetAccessorDeclaration(parent) ||
    Node.isSetAccessorDeclaration(parent) ||
    Node.isEnumMember(parent)
  ) {
    return parent.getNameNode() !== identifier;
  }
  return true;
}

/** The binding read by an identifier, rather than a shorthand property or export alias. */
export function referenceSymbol(identifier: Node) {
  const parent = identifier.getParent();
  if (
    Node.isShorthandPropertyAssignment(parent) &&
    parent.getNameNode() === identifier
  ) {
    return parent.getValueSymbol();
  }
  if (Node.isExportSpecifier(parent) && parent.getNameNode() === identifier) {
    return parent.getLocalTargetSymbol();
  }
  return identifier.getSymbol();
}

/** How often each name is referenced outside the imports. */
export function identifierCounts(file: SourceFile): Map<string, number> {
  const counts = new Map<string, number>();
  for (const identifier of file.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (
      identifier.getFirstAncestorByKind(SyntaxKind.ImportDeclaration) ||
      !isReference(identifier)
    )
      continue;
    counts.set(
      identifier.getText(),
      (counts.get(identifier.getText()) ?? 0) + 1,
    );
  }
  return counts;
}

export function addNamedImports(
  file: SourceFile,
  specifier: string,
  names: readonly ImportedName[],
): readonly ImportSpecifier[] {
  const added: ImportedName[] = [];
  for (const name of names) {
    const present = file
      .getImportDeclarations()
      .filter(
        (declaration) => declaration.getModuleSpecifierValue() === specifier,
      )
      .flatMap((declaration) => declaration.getNamedImports())
      .find(
        (named) =>
          named.getName() === name.name &&
          (named.getAliasNode()?.getText() ?? named.getName()) ===
            (name.alias ?? name.name),
      );
    if (present !== undefined) {
      const declaration = present.getImportDeclaration();
      if (
        name.isTypeOnly ||
        (!declaration.isTypeOnly() && !present.isTypeOnly())
      )
        continue;
      if (!declaration.isTypeOnly()) {
        present.setIsTypeOnly(false);
        continue;
      }
      present.remove();
      if (
        declaration.getNamedImports().length === 0 &&
        declaration.getDefaultImport() === undefined &&
        declaration.getNamespaceImport() === undefined
      ) {
        declaration.remove();
      }
    }
    added.push(name);
  }
  if (added.length === 0) return [];
  const imports = file.getImportDeclarations();
  return file
    .insertImportDeclaration(
      imports.length === 0 ? 0 : imports.at(-1)!.getChildIndex() + 1,
      { moduleSpecifier: specifier, namedImports: added },
    )
    .getNamedImports();
}

/** How many references outside the imports read each import binding, by its local name. */
export function importReferences(file: SourceFile): Map<string, number> {
  const bindings = new Map(
    file.getImportDeclarations().flatMap((declaration) =>
      importBindings(declaration).flatMap(({ local }) => {
        const symbol = local.getSymbol();
        return symbol === undefined ? [] : [[symbol, local.getText()] as const];
      }),
    ),
  );
  const counts = new Map<string, number>();
  for (const identifier of file.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (identifier.getFirstAncestorByKind(SyntaxKind.ImportDeclaration))
      continue;
    const symbol = referenceSymbol(identifier);
    const name = symbol === undefined ? undefined : bindings.get(symbol);
    if (name !== undefined) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}

/**
 * The import bindings `file` reads as values, so a compiler that drops
 * imports used only as types keeps their declarations.
 */
export function valueImportNames(file: SourceFile): Set<string> {
  const bindings = new Map(
    file.getImportDeclarations().flatMap((declaration) =>
      importBindings(declaration).flatMap(({ local, isTypeOnly }) => {
        const symbol = isTypeOnly ? undefined : local.getSymbol();
        return symbol === undefined ? [] : [[symbol, local.getText()] as const];
      }),
    ),
  );
  const names = new Set<string>();
  for (const identifier of file.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (identifier.getFirstAncestorByKind(SyntaxKind.ImportDeclaration))
      continue;
    const symbol = referenceSymbol(identifier);
    const name = symbol === undefined ? undefined : bindings.get(symbol);
    if (name !== undefined && !inTypePosition(identifier)) names.add(name);
  }
  return names;
}

/** Whether `node` sits where a compiler erases it: a type, or an `implements` clause. */
function inTypePosition(node: Node): boolean {
  return node
    .getAncestors()
    .some(
      (ancestor) =>
        Node.isTypeNode(ancestor) ||
        Node.isInterfaceDeclaration(ancestor) ||
        Node.isTypeAliasDeclaration(ancestor) ||
        (Node.isHeritageClause(ancestor) &&
          ancestor.getToken() === SyntaxKind.ImplementsKeyword),
    );
}

/**
 * Drops unused types and replaced framework imports, preserving authored
 * runtime dependencies. An authored import that `liveBefore` read as a
 * value and the conversion left read only as a type, or not at all, would be
 * dropped by the compiler and stop loading its module, so a bare import of
 * the same module goes right before it.
 */
export function removeOrphanedImports(
  file: SourceFile,
  before: ReadonlyMap<string, number>,
  replaced: ReadonlySet<string> = new Set(),
  liveBefore: ReadonlySet<string> = new Set(),
) {
  const after = importReferences(file);
  const orphaned = (name: string) =>
    (before.get(name) ?? 0) > 0 && !after.has(name);
  for (const declaration of file.getImportDeclarations()) {
    if (
      !declaration.isTypeOnly() &&
      !replaced.has(declaration.getModuleSpecifierValue())
    )
      continue;
    for (const named of declaration.getNamedImports()) {
      if (orphaned((named.getAliasNode() ?? named.getNameNode()).getText())) {
        named.remove();
      }
    }
    const defaultImport = declaration.getDefaultImport();
    const namespace = declaration.getNamespaceImport();
    if (
      (defaultImport !== undefined || namespace !== undefined) &&
      [defaultImport, namespace].every(
        (binding) => binding === undefined || orphaned(binding.getText()),
      ) &&
      declaration.getNamedImports().length === 0
    ) {
      declaration.remove();
    } else if (
      defaultImport !== undefined &&
      orphaned(defaultImport.getText())
    ) {
      declaration.removeDefaultImport();
    }
  }
  const liveAfter = valueImportNames(file);
  for (const declaration of file.getImportDeclarations()) {
    if (
      declaration.isTypeOnly() ||
      replaced.has(declaration.getModuleSpecifierValue())
    ) {
      continue;
    }
    const locals = importBindings(declaration)
      .filter(({ isTypeOnly }) => !isTypeOnly)
      .map(({ local }) => local.getText());
    if (
      !locals.some((name) => liveBefore.has(name)) ||
      locals.some((name) => liveAfter.has(name))
    ) {
      continue;
    }
    // The declaration stays: later steps may add the names they need to it.
    file.insertStatements(
      declaration.getChildIndex(),
      `import ${declaration.getModuleSpecifier().getText()};`,
    );
  }
}

/** An import the conversion emptied, now that the new names are in. */
export function removeEmptyImports(
  file: SourceFile,
  replaced: ReadonlySet<string>,
) {
  for (const declaration of file.getImportDeclarations()) {
    if (
      declaration.getImportClause() !== undefined &&
      (declaration.isTypeOnly() ||
        replaced.has(declaration.getModuleSpecifierValue())) &&
      declaration.getNamedImports().length === 0 &&
      declaration.getDefaultImport() === undefined &&
      declaration.getNamespaceImport() === undefined
    ) {
      declaration.remove();
    }
  }
}

/** The names a top-level statement declares. */
export function topLevelNames(statement: Node): string[] {
  if (Node.isVariableStatement(statement)) {
    return statement.getDeclarations().flatMap(variableNames);
  }
  const name = (
    statement as { getName?: () => string | undefined }
  ).getName?.();
  return name === undefined ? [] : [name];
}
