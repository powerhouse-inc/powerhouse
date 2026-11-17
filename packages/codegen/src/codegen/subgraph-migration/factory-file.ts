/** Preserves the resolver factory module and plans the bindings its moved code needs. */
import {
  type ImportDeclaration,
  Node,
  type Project,
  type SourceFile,
  SyntaxKind,
  VariableDeclarationKind,
} from "ts-morph";
import { posix } from "node:path";
import {
  directEvalCall,
  importBindings,
  importMetaRead,
} from "../migration-ast.js";
import {
  dirnameOf,
  type Input,
  KEPT_SDL,
  lineOf,
  readerTargets,
  refuse,
  sourceFile,
} from "./context.js";
import type { ResolverFactory } from "./resolver-factory.js";
import {
  isReference,
  localBindings,
  referenceSymbol,
} from "./source-imports.js";

type KeptExport = {
  readonly name: string;
  readonly isTypeOnly: boolean;
};

export type FactoryFilePlan = {
  /** The imports index.ts gains for bindings used by the moved code. */
  readonly imports: readonly string[];
  /** What index.ts imports from the file, which stays. */
  readonly keptExports: readonly KeptExport[];
  /**
   * Whether another file reads the factory module whole (`import * as`,
   * `export *`, a dynamic import or mock, or an importer outside the
   * package), so an export added to it changes what that file sees.
   */
  readonly readWhole: boolean;
  readonly notes: readonly string[];
};

/**
 * Plans how the code moved out of the factory's file keeps reading what it
 * read. Its module and original import edge stay to preserve initialization
 * order, including global reads and re-export dependencies. Refuses a name
 * the move would make clash or shadow.
 */
export function planFactoryFile(
  project: Project,
  input: Input,
  index: SourceFile,
  located: ResolverFactory,
  filePath: string,
): FactoryFilePlan {
  const { file, factory, map } = located;
  const directEval = directEvalCall(file) ?? directEvalCall(index);
  if (directEval !== undefined) {
    refuse(
      directEval.getSourceFile().getFilePath().slice(1),
      lineOf(directEval),
      "The entry or resolver factory calls eval, which can read bindings and arguments changed by migration.",
      "Replace direct eval with ordinary code before migrating this subgraph.",
    );
  }
  const readers = factoryFileReaders(project, input, located, filePath);
  if (
    file === index &&
    located.statement !== undefined &&
    readers.factoryImported
  ) {
    refuse(
      filePath,
      lineOf(located.statement),
      `Another module reads the entry file that declares ${factory.name}; removing the factory could break its exports.`,
      "Move the shared factory into a separate helper module before migrating.",
    );
  }
  const location =
    file === index ? undefined : importMetaRead(factory.node ?? map);
  if (location !== undefined) {
    refuse(
      filePath,
      lineOf(location),
      "The moved code reads import.meta, which would name index.ts instead of its original module.",
      "Keep the location-dependent code in a separate imported helper, or pass its asset location explicitly.",
    );
  }
  const notes =
    file === index
      ? []
      : [
          `${filePath} is kept to preserve its initialization order and shared bindings.`,
        ];
  const reads = movedReads(index, located, filePath, [factory.node ?? map]);
  const indexBound = localBindings(index);
  const added = addedImports(
    input,
    index,
    located,
    filePath,
    reads.imports,
    indexBound,
  );
  const keptExports = keptExportsOf(
    located,
    filePath,
    reads.locals,
    indexBound,
  );
  checkImportOrder(
    index,
    located,
    new Set([
      ...file
        .getImportDeclarations()
        .flatMap(importBindings)
        .filter(
          ({ local, isTypeOnly }) =>
            !isTypeOnly && reads.imports.has(local.getText()),
        )
        .map(({ local }) => local.getText()),
      ...keptExports
        .filter(({ isTypeOnly }) => !isTypeOnly)
        .map(({ name }) => name),
    ]),
  );
  checkShadowedGlobals(index, filePath, [
    ...added.map((entry) => entry.name),
    ...keptExports.map((entry) => entry.name),
  ]);
  return {
    imports: added.map(({ text }) => text),
    keptExports,
    readWhole: readers.readWhole,
    notes,
  };
}

/** Earlier imports may have been erased until the moved code reads them at runtime. */
function checkImportOrder(
  index: SourceFile,
  located: ResolverFactory,
  runtimeNames: ReadonlySet<string>,
) {
  const original = located.importSpecifier?.getImportDeclaration();
  if (original === undefined) return;
  for (const declaration of index.getImportDeclarations()) {
    if (declaration.getStart() >= original.getStart()) break;
    // Declaration-level type imports are moved to a fresh appended import.
    if (declaration.isTypeOnly()) continue;
    for (const { local } of importBindings(declaration)) {
      const name = local.getText();
      if (!runtimeNames.has(name)) continue;
      refuse(
        index.getFilePath().slice(1),
        lineOf(local),
        `The resolvers need ${name} at runtime, but its entry import precedes the factory import. Reusing it could activate an erased import and change initialization order.`,
        "Give the shared dependency an explicit initialization order before migrating, or keep this subgraph schema-first.",
      );
    }
  }
}

/** A specifier of the factory's file, as index.ts would write it. */
function rebase(input: Input, filePath: string, specifier: string): string {
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
    return specifier;
  }
  const target = posix.join(dirnameOf(filePath), specifier);
  const relative = posix.relative(input.dir, target);
  return relative.startsWith(".") ? relative : `./${relative}`;
}

/**
 * Who else reads the factory's file, including complete module literals
 * stored in variables, and readers outside the directory named by the caller.
 */
function factoryFileReaders(
  project: Project,
  input: Input,
  located: ResolverFactory,
  filePath: string,
): { readonly readWhole: boolean; readonly factoryImported: boolean } {
  const { factory } = located;
  const outside = input.importedFromOutside?.has(filePath) ?? false;
  let factoryImported = outside;
  let readWhole =
    outside && (input.readWholeFromOutside?.has(filePath) ?? true);
  for (const path of input.files.keys()) {
    if (!/\.[cm]?[jt]sx?$/.test(path)) continue;
    const other = sourceFile(project, input, path);
    const reads = (specifier: string) =>
      readerTargets(input.files, dirnameOf(path), specifier).includes(filePath);
    for (const declaration of other.getImportDeclarations()) {
      if (!reads(declaration.getModuleSpecifierValue())) continue;
      const namedReaders = declaration
        .getNamedImports()
        .filter((named) => named !== located.importSpecifier);
      if (
        namedReaders.length === 0 &&
        declaration.getDefaultImport() === undefined &&
        declaration.getNamespaceImport() === undefined &&
        declaration === located.importSpecifier?.getImportDeclaration()
      ) {
        continue;
      }
      if (declaration.getNamespaceImport() !== undefined) readWhole = true;
      if (
        declaration.getDefaultImport() !== undefined ||
        declaration.getNamespaceImport() !== undefined ||
        namedReaders.some(
          (named) =>
            named.getName() === factory.name || named.getName() === "default",
        )
      ) {
        factoryImported = true;
      }
    }
    for (const declaration of other.getExportDeclarations()) {
      const specifier = declaration.getModuleSpecifierValue();
      if (specifier === undefined || !reads(specifier)) continue;
      if (!declaration.hasNamedExports()) readWhole = true;
      if (
        !declaration.hasNamedExports() ||
        declaration
          .getNamedExports()
          .some(
            (named) =>
              named.getName() === factory.name || named.getName() === "default",
          )
      ) {
        factoryImported = true;
      }
    }
    for (const literal of other
      .getDescendants()
      .filter(
        (node) =>
          Node.isStringLiteral(node) ||
          Node.isNoSubstitutionTemplateLiteral(node),
      )) {
      const parent = literal.getParent();
      if (
        !Node.isImportDeclaration(parent) &&
        !Node.isExportDeclaration(parent) &&
        reads(literal.getLiteralValue())
      ) {
        factoryImported = true;
        readWhole = true;
      }
    }
  }
  return { readWhole, factoryImported };
}

/**
 * What the moved code reads from the factory file's imports, by local name,
 * and, when the file stays, its other declarations the code reads. Refuses
 * an assignment to a variable that stays, and a global the code reads that
 * index.ts declares.
 */
function movedReads(
  index: SourceFile,
  located: ResolverFactory,
  filePath: string,
  moved: readonly Node[],
): {
  readonly imports: ReadonlySet<string>;
  readonly locals: ReadonlySet<Node>;
} {
  const { file } = located;
  const imports = new Set<string>();
  const locals = new Set<Node>();
  for (const root of moved) {
    for (const identifier of root
      .getDescendantsOfKind(SyntaxKind.Identifier)
      .filter(isReference)) {
      const declarations = referenceSymbol(identifier)?.getDeclarations() ?? [];
      for (const declaration of declarations) {
        if (
          declaration.getFirstAncestorByKind(SyntaxKind.ImportDeclaration) !==
            undefined &&
          declaration.getSourceFile() === file
        ) {
          imports.add(identifier.getText());
        }
        let statement: Node | undefined = declaration;
        while (statement !== undefined && statement.getParent() !== file) {
          statement = statement.getParent();
        }
        if (
          file !== index &&
          statement !== undefined &&
          statement !== located.statement &&
          !Node.isImportDeclaration(statement)
        ) {
          // An import is read-only, so a variable the code assigns must stay
          // where it is.
          if (
            Node.isVariableDeclaration(declaration) &&
            declaration.getVariableStatement()?.getDeclarationKind() !==
              VariableDeclarationKind.Const &&
            isWrite(identifier)
          ) {
            refuse(
              filePath,
              lineOf(identifier),
              `The resolvers assign ${identifier.getText()}, a variable of ${filePath}, which stays because another file imports it; index.ts could only import it read-only.`,
              `Move ${identifier.getText()} into the resolver factory, or keep this subgraph schema-first.`,
            );
          }
          locals.add(declaration);
        }
      }
      // A global the moved code reads must not become a name index.ts binds.
      if (
        file !== index &&
        !declarations.some(
          (declaration) => declaration.getSourceFile() === file,
        ) &&
        localBindings(index).has(identifier.getText())
      ) {
        refuse(
          filePath,
          lineOf(identifier),
          `The resolvers read the global ${identifier.getText()}, and index.ts declares its own ${identifier.getText()}.`,
          `Rename ${identifier.getText()} in index.ts.`,
        );
      }
    }
  }
  return { imports, locals };
}

/**
 * The import declarations index.ts gains for `names`, which the moved code
 * reads from the factory file's imports. Refuses a name index.ts binds to
 * something else.
 */
function addedImports(
  input: Input,
  index: SourceFile,
  located: ResolverFactory,
  filePath: string,
  names: ReadonlySet<string>,
  indexBound: ReadonlyMap<string, string>,
): { readonly name: string; readonly text: string }[] {
  const { file } = located;
  const entryImports = new Map(
    index
      .getImportDeclarations()
      .flatMap((declaration) =>
        importBindings(declaration).map(
          (binding) => [binding.local.getText(), binding] as const,
        ),
      ),
  );
  const imported = new Map<string, ImportDeclaration>();
  for (const declaration of file.getImportDeclarations()) {
    for (const { local } of importBindings(declaration)) {
      imported.set(local.getText(), declaration);
    }
  }
  const added: { name: string; text: string }[] = [];
  for (const name of names) {
    const declaration = imported.get(name)!;
    const specifier = rebase(
      input,
      filePath,
      declaration.getModuleSpecifierValue(),
    );
    const named = declaration
      .getNamedImports()
      .find(
        (candidate) =>
          (candidate.getAliasNode() ?? candidate.getNameNode()).getText() ===
          name,
      );
    const binding =
      named !== undefined
        ? `${specifier}#${named.getName()}`
        : declaration.getDefaultImport()?.getText() === name
          ? `${specifier}#default`
          : `${specifier}#*`;
    const existing = indexBound.get(name);
    const typeOnly = declaration.isTypeOnly() || (named?.isTypeOnly() ?? false);
    if (existing === binding) {
      if (!typeOnly && entryImports.get(name)?.isTypeOnly) {
        refuse(
          filePath,
          lineOf(declaration),
          `The resolvers read ${name} at runtime, but index.ts imports it only as a type.`,
          `Make ${name} a value import in index.ts while preserving module initialization order before migrating.`,
        );
      }
      continue;
    }
    if (existing !== undefined && file !== index) {
      refuse(
        filePath,
        lineOf(declaration),
        specifier.endsWith(`${KEPT_SDL}.js`) || specifier.endsWith(KEPT_SDL)
          ? `The resolvers read ${name}, the schema-first SDL, which index.ts also imports for typeDefs; the two would clash once the resolvers move into index.ts.`
          : `The resolvers read ${name}, and index.ts already declares another ${name}.`,
        `Rename ${name} in one of the files.`,
      );
    }
    if (file === index) continue;
    added.push({
      name,
      text:
        named !== undefined
          ? `import ${typeOnly ? "type " : ""}{ ${named.getAliasNode() === undefined ? named.getName() : `${named.getName()} as ${name}`} } from ${JSON.stringify(specifier)};`
          : declaration.getDefaultImport()?.getText() === name
            ? `import ${typeOnly ? "type " : ""}${name} from ${JSON.stringify(specifier)};`
            : `import ${typeOnly ? "type " : ""}* as ${name} from ${JSON.stringify(specifier)};`,
    });
  }
  return added;
}

/** The declarations of the kept factory file index.ts imports; refuses a name index.ts binds otherwise. */
function keptExportsOf(
  located: ResolverFactory,
  filePath: string,
  locals: ReadonlySet<Node>,
  indexBound: ReadonlyMap<string, string>,
): KeptExport[] {
  const keptExports: KeptExport[] = [];
  const names = new Set<string>();
  for (const declaration of locals) {
    const name = (
      declaration as { getName?: () => string | undefined }
    ).getName?.();
    if (name === undefined) continue;
    if (names.has(name)) {
      refuse(
        filePath,
        lineOf(declaration),
        `${name} has merged declarations in the resolver factory module.`,
        "Move the merged declaration into a separate helper module before migrating.",
      );
    }
    names.add(name);
    if (
      indexBound.has(name) &&
      indexBound.get(name) !== `${located.importedFrom}#${name}`
    ) {
      refuse(
        filePath,
        lineOf(declaration),
        `The resolvers read ${name}, and index.ts already declares another ${name}.`,
        `Rename ${name} in one of the files.`,
      );
    }
    keptExports.push({
      name,
      isTypeOnly:
        Node.isInterfaceDeclaration(declaration) ||
        Node.isTypeAliasDeclaration(declaration),
    });
  }
  return keptExports;
}

/** Refuses a name index.ts gains that would shadow a global index.ts reads. */
function checkShadowedGlobals(
  index: SourceFile,
  filePath: string,
  names: readonly string[],
) {
  const indexGlobals = new Set(
    index
      .getDescendantsOfKind(SyntaxKind.Identifier)
      .filter(
        (identifier) =>
          isReference(identifier) &&
          identifier.getFirstAncestorByKind(SyntaxKind.ImportDeclaration) ===
            undefined &&
          !(referenceSymbol(identifier)?.getDeclarations() ?? []).some(
            (declaration) => declaration.getSourceFile() === index,
          ),
      )
      .map((identifier) => identifier.getText()),
  );
  for (const name of names) {
    if (name !== "" && indexGlobals.has(name)) {
      refuse(
        filePath,
        1,
        `${filePath} declares or imports ${name}, which would shadow the global ${name} that index.ts reads after migration.`,
        `Rename ${name} in ${filePath}.`,
      );
    }
  }
}

/**
 * Whether an identifier is assigned to, directly or as a target of a
 * destructuring assignment or a for-in/of loop, or incremented or decremented.
 */
function isWrite(identifier: Node): boolean {
  // Climb out of a destructuring pattern to the expression it is.
  let target: Node = identifier;
  for (;;) {
    const up = target.getParent();
    if (
      up !== undefined &&
      (Node.isArrayLiteralExpression(up) ||
        Node.isObjectLiteralExpression(up) ||
        Node.isShorthandPropertyAssignment(up) ||
        (Node.isPropertyAssignment(up) && up.getInitializer() === target) ||
        Node.isSpreadElement(up) ||
        Node.isSpreadAssignment(up) ||
        Node.isParenthesizedExpression(up))
    ) {
      target = up;
      continue;
    }
    break;
  }
  const loop = target.getParent();
  if (
    (Node.isForOfStatement(loop) || Node.isForInStatement(loop)) &&
    loop.getInitializer() === target
  ) {
    return true;
  }
  if (target !== identifier) {
    const assignment = target.getParent();
    return (
      Node.isBinaryExpression(assignment) &&
      assignment.getLeft() === target &&
      assignment.getOperatorToken().getKind() === SyntaxKind.EqualsToken
    );
  }
  const parent = identifier.getParent();
  if (
    Node.isBinaryExpression(parent) &&
    parent.getLeft() === identifier &&
    parent.getOperatorToken().getText().endsWith("=") &&
    !["==", "===", "!=", "!==", "<=", ">="].includes(
      parent.getOperatorToken().getText(),
    )
  ) {
    return true;
  }
  return (
    (Node.isPrefixUnaryExpression(parent) ||
      Node.isPostfixUnaryExpression(parent)) &&
    [SyntaxKind.PlusPlusToken, SyntaxKind.MinusMinusToken].includes(
      parent.getOperatorToken(),
    )
  );
}
